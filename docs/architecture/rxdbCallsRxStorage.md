# RxDB Query Pipeline and Storage Adapter Requirements

This document explains what RxDB does (and doesn't do) when processing queries, and what storage adapters must handle themselves.

## Query Pipeline Overview

When a query is executed, it follows this path:

```typescript
// Inside RxQueryBase (src/rx-query.ts)
getPreparedQuery(): PreparedQuery<RxDocType> {
    const hookInput = {
        rxQuery: this,
        mangoQuery: normalizeMangoQuery<RxDocType>(  // 1. Normalization
            this.collection.schema.jsonSchema,
            this.mangoQuery
        )
    };
    
    // Inject the _deleted check
    (hookInput.mangoQuery.selector as any)._deleted = { $eq: false };
    if (hookInput.mangoQuery.index) {
        hookInput.mangoQuery.index.unshift('_deleted');
    }
    
    runPluginHooks('prePrepareQuery', hookInput);

    const value = prepareQuery(  // 2. Prepare (adds Query Plan)
        this.collection.schema.jsonSchema,
        hookInput.mangoQuery as any
    );

    this.getPreparedQuery = () => value;
    return value;
}

// Then passed to storage
const preparedQuery = rxQuery.getPreparedQuery();
const queryResult = await collection.storageInstance.query(preparedQuery);  // 3. Storage receives it
```

## What `normalizeMangoQuery` Actually Does

**Source:** `src/rx-query-helper.ts`

The normalization is **extremely limited** and only handles top-level transformations:

```typescript
/**
 * TODO this must work recursive with nested queries that
 * contain multiple selectors via $and or $or etc.
 */
Object
    .entries(normalizedMangoQuery.selector)
    .forEach(([field, matcher]) => {
        if (typeof matcher !== 'object' || matcher === null) {
            (normalizedMangoQuery as any).selector[field] = {
                $eq: matcher
            };
        }
    });
```

### What It Does

- ✅ Converts `{ foo: 'bar' }` → `{ foo: { $eq: 'bar' } }` (top-level only)
- ✅ Adds `skip: 0` if missing
- ✅ Adds `sort` based on index or primary key
- ✅ Ensures `selector` exists
- ✅ Injects `_deleted: { $eq: false }` at top level

### What It Does NOT Do

- ❌ Recursive normalization of nested operators
- ❌ Expansion of `$and`, `$or`, `$not`, `$nor`
- ❌ Normalization inside nested logical operators
- ❌ Any transformation of object-type values

### Example: Nested Operators Pass Through Untouched

For `{ field: { $not: { $or: [...] } } }`:

1. `normalizeMangoQuery` sees `field` has an object value
2. `typeof matcher === 'object'` → `true`
3. Skips it completely
4. `prepareQuery` wraps it with `queryPlan`
5. Storage receives it exactly as written

## Mingo's Role

**Mingo is NOT a query normalizer.** It's an execution engine used only for in-memory query evaluation.

**Source:** `src/rx-query-helper.ts`

```typescript
const mingoQuery = getMingoQuery(query.selector as any);
const fun: QueryMatcher<RxDocumentData<RxDocType>> = (doc: RxDocumentData<RxDocType>) => {
    return mingoQuery.test(doc);
};
```

Mingo is used for:
- In-memory execution via `mingoQuery.test(doc)`
- Event-Reduce algorithm
- Fallback sorting via `getQueryMatcher` and `getSortComparator`

Mingo does **zero transformation** of the query before storage receives it.

## What Storage Adapters Receive

```typescript
{
  query: {
    selector: {
      field: { $not: { $or: [...] } },  // Raw, untouched nested operators
      _deleted: { $eq: false }          // Injected by RxDB
    },
    skip: 0,
    sort: [{ id: 'asc' }]
  },
  queryPlan: {
    index: ['id'],
    sortSatisfiedByIndex: false,
    selectorSatisfiedByIndex: false,
    startKeys: [],
    endKeys: [],
    inclusiveStart: true,
    inclusiveEnd: true
  }
}
```

## Storage Adapter Requirements

Storage adapters must handle:

- ✅ Nested `$and`, `$or`, `$not`, `$nor` operators at any depth
- ✅ Shorthand equality inside nested operators (e.g., `{ $or: [{ foo: 'bar' }] }`)
- ✅ All operator combinations at any nesting level
- ✅ Building recursive SQL WHERE clause traversal
- ✅ All 18 MongoDB query operators

**RxDB will NOT sanitize or normalize nested queries for you.**

---

## Document Validation: What RxDB DOES Guarantee

While RxDB doesn't normalize queries, it **validates every document with Ajv before `storage.bulkWrite()`**.

### The Validation Wrapper

**Source:** `.ignoreFolder/rxdb/src/plugin-helpers.ts` (lines 102-138)

```typescript
const oldBulkWrite = instance.bulkWrite.bind(instance);
instance.bulkWrite = (documentWrites, context) => {
    const errors = [];
    const continueWrites = [];
    
    documentWrites.forEach(row => {
        const validationErrors = validatorCached(row.document);  // AJV VALIDATION
        
        if (validationErrors.length > 0) {
            errors.push({
                status: 422,  // VALIDATION ERROR
                documentId,
                validationErrors
            });
        } else {
            continueWrites.push(row);  // ONLY VALID DOCS PROCEED
        }
    });
    
    // ONLY VALID DOCUMENTS REACH STORAGE
    return continueWrites.length > 0 
        ? oldBulkWrite(continueWrites, context)
        : Promise.resolve({ error: [], success: [] });
};
```

### What Ajv Validates

Ajv validates **document structure** against JSON Schema, NOT query conditions.

**Example Schema:**
```typescript
{
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', maxLength: 40 },
    age: { type: 'number', minimum: 0, maximum: 120 },
    tags: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['A', 'B', 'C'] }
  }
}
```

**Ajv checks:**
- ✅ Data types (string, number, boolean, object, array)
- ✅ Required fields exist
- ✅ String length/pattern constraints
- ✅ Number min/max bounds
- ✅ Enum values
- ✅ Object structure (properties, additionalProperties)
- ✅ Array constraints (items, length)

**Ajv does NOT check:**
- ❌ Query conditions (that's Mingo's job)
- ❌ Business logic
- ❌ Cross-document constraints

### The Write Flow

```
User calls collection.insert(doc)
    ↓
Collection calls storageInstance.bulkWrite()
    ↓
Wrapped bulkWrite intercepts (plugin-helpers.ts)
    ↓
Ajv validates EACH document
    ↓
    ├─ Invalid → 422 error, NEVER reaches storage
    └─ Valid → proceeds to actual storage.bulkWrite()
```

## Implications for Storage Adapters

### You CAN Trust Schema Types

1. **All documents in storage are schema-valid**
   - If schema says `age: { type: 'number' }`, it's ALWAYS a number
   - If schema says `tags: { type: 'array' }`, it's ALWAYS an array
   - No need for runtime type guards in most cases

2. **Invalid documents NEVER reach storage**
   - Schema violations throw 422 errors at write-time
   - No "garbage data" in the database

3. **Type-based optimizations are safe**
   - Fast Path: Known array types → use `json_array_length` directly
   - Safe Path: Unknown types → add runtime type guards
   - Hybrid approach balances performance and correctness

### Example: Type-Safe Query Translation

```typescript
// In query translation
const columnInfo = getColumnInfo(fieldName, schema);

if (columnInfo.type === 'array') {
    // SAFE: Schema guarantees this field is ALWAYS an array
    return `json_array_length(data, '$.${fieldName}') = ?`;
}

if (columnInfo.type === 'unknown') {
    // SAFE PATH: Field not in schema, add runtime guard
    return `(json_type(data, '$.${fieldName}') = 'array' AND json_array_length(...) = ?)`;
}
```

## Key Differences: Ajv vs Mingo

| Ajv (Structure Validation) | Mingo (Query Evaluation) |
|----------------------------|--------------------------|
| `{type: 'number', minimum: 18}` | `{age: {$gte: 18}}` |
| "age MUST be number >= 18" | "FIND docs where age >= 18" |
| Validates document structure | Matches documents by criteria |
| Runs on EVERY write | Runs on queries |
| Throws 422 if invalid | Returns matching docs |

## Summary

- **Query Normalization:** Limited to top-level shorthand equality only
- **Nested Operators:** Pass through untouched to storage adapters
- **Document Validation:** Ajv validates ALL writes against schema
- **Type Safety:** Storage adapters can trust schema types for optimization
- **Storage Responsibility:** Must handle all query operators and nesting levels
