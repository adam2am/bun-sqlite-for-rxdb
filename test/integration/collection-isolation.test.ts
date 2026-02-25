import { describe, it, expect } from 'bun:test';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { getRxStorageBunSQLite } from '$app/index';

addRxPlugin(RxDBDevModePlugin);

describe('Collection Isolation', () => {
  it('should NOT leak events across different collections in same database', async () => {
    const dbName = 'test-collection-isolation-' + Date.now();
    
    const db = await createRxDatabase({
      name: dbName,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageBunSQLite() }),
      multiInstance: true,
      ignoreDuplicate: true
    });

    await db.addCollections({
      users: {
        schema: {
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 100 },
            name: { type: 'string' }
          },
          required: ['id', 'name']
        }
      },
      posts: {
        schema: {
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 100 },
            title: { type: 'string' }
          },
          required: ['id', 'title']
        }
      }
    });

    let usersChangeCount = 0;
    let postsChangeCount = 0;

    const usersSub = db.users.find().$.subscribe(() => {
      usersChangeCount++;
    });

    const postsSub = db.posts.find().$.subscribe(() => {
      postsChangeCount++;
    });

    await new Promise(resolve => setTimeout(resolve, 100));
    
    const initialUsersCount = usersChangeCount;
    const initialPostsCount = postsChangeCount;

    await db.posts.insert({ id: 'post1', title: 'Hello World' });
    
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(postsChangeCount).toBeGreaterThan(initialPostsCount);
    expect(usersChangeCount).toBe(initialUsersCount);

    usersSub.unsubscribe();
    postsSub.unsubscribe();
    await db.remove();
  });
});
