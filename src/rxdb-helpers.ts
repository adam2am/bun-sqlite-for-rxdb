import type {
  RxStorageInstance,
  BulkWriteRow,
  RxDocumentData,
  RxStorageWriteError,
  EventBulk,
  RxStorageChangeEvent,
  RxStorageInstanceCreationParams,
  RxStorageDefaultCheckpoint
} from 'rxdb';

export function categorizeBulkWriteRows<RxDocType>(
  storageInstance: RxStorageInstance<RxDocType, any, any>,
  primaryPath: string,
  docsInDb: Map<string, RxDocumentData<RxDocType>>,
  bulkWriteRows: BulkWriteRow<RxDocType>[],
  context: string
): {
  bulkInsertDocs: BulkWriteRow<RxDocType>[];
  bulkUpdateDocs: BulkWriteRow<RxDocType>[];
  errors: RxStorageWriteError<RxDocType>[];
  eventBulk: EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, RxStorageDefaultCheckpoint>;
  newestRow?: BulkWriteRow<RxDocType>;
} {
  const bulkInsertDocs: BulkWriteRow<RxDocType>[] = [];
  const bulkUpdateDocs: BulkWriteRow<RxDocType>[] = [];
  const errors: RxStorageWriteError<RxDocType>[] = [];
  const events: RxStorageChangeEvent<RxDocumentData<RxDocType>>[] = [];
  let newestRow: BulkWriteRow<RxDocType> | undefined;

  for (const writeRow of bulkWriteRows) {
    const document = writeRow.document;
    const docId = document[primaryPath as keyof RxDocumentData<RxDocType>] as string;
    const documentInDb = docsInDb.get(docId);
    const previous = writeRow.previous;

    if (!previous) {
      if (documentInDb) {
        errors.push({
          isError: true,
          status: 409,
          documentId: docId,
          writeRow,
          documentInDb
        });
        continue;
      }
      bulkInsertDocs.push(writeRow);
      newestRow = writeRow;
      events.push({
        documentId: docId,
        documentData: document,
        operation: 'INSERT',
        previousDocumentData: undefined
      });
    } else {
      if (!documentInDb || documentInDb._rev !== previous._rev) {
        errors.push({
          isError: true,
          status: 409,
          documentId: docId,
          writeRow,
          documentInDb: documentInDb || document
        });
        continue;
      }
      bulkUpdateDocs.push(writeRow);
      newestRow = writeRow;
      const operation = previous._deleted && !document._deleted ? 'INSERT' :
                       !previous._deleted && document._deleted ? 'DELETE' : 'UPDATE';
      events.push({
        documentId: docId,
        documentData: document,
        operation,
        previousDocumentData: previous
      });
    }
  }

  return {
    bulkInsertDocs,
    bulkUpdateDocs,
    errors,
    newestRow,
    eventBulk: {
      checkpoint: { id: '', lwt: 0 },
      context,
      events,
      id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 11)
    }
  };
}

export function ensureRxStorageInstanceParamsAreCorrect(
  params: RxStorageInstanceCreationParams<any, any>
): void {
  if (params.schema.keyCompression) {
    throw new Error('UT5: RX_SCHEMA_KEY_COMPRESSION_USED');
  }
  if (params.schema.encrypted && params.schema.encrypted.length > 0 && !params.password) {
    throw new Error('UT6: RX_SCHEMA_ENCRYPTED_FIELDS_MISSING_PASSWORD');
  }
}

