import type {
	RxDocumentData,
	RxStorageWriteError,
	BulkWriteRow,
	RxAttachmentWriteData,
	RxAttachmentData,
	RxStorageInstance,
	RxStorageInstanceCreationParams,
	EventBulk,
	RxStorageChangeEvent,
	RxStorageDefaultCheckpoint
} from 'rxdb';

export interface AttachmentOperation {
  documentId: string;
  attachmentId: string;
  attachmentData: RxAttachmentWriteData;
  digest: string;
}

export interface AttachmentRemoveOperation {
  documentId: string;
  attachmentId: string;
  digest: string;
}

function randomToken(length: number): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

function flatClone<T>(obj: T): T {
  return Object.assign({}, obj);
}

export function getAttachmentSize(attachmentBase64String: string): number {
  return atob(attachmentBase64String).length;
}

export function attachmentWriteDataToNormalData(writeData: RxAttachmentWriteData): RxAttachmentData {
  const data = writeData.data;
  if (!data) {
    return writeData;
  }
  return {
    length: getAttachmentSize(data),
    digest: writeData.digest,
    type: writeData.type
  };
}

export function stripAttachmentsDataFromDocument<T>(doc: RxDocumentData<T>): RxDocumentData<T> {
  if (!doc._attachments || Object.keys(doc._attachments).length === 0) {
    return doc;
  }
  const useDoc = flatClone(doc);
  useDoc._attachments = {};
  Object.entries(doc._attachments).forEach(([attachmentId, attachmentData]) => {
    useDoc._attachments[attachmentId] = attachmentWriteDataToNormalData(attachmentData as RxAttachmentWriteData);
  });
  return useDoc;
}

export function stripAttachmentsDataFromRow<T>(writeRow: BulkWriteRow<T>): BulkWriteRow<T> {
  return {
    previous: writeRow.previous,
    document: stripAttachmentsDataFromDocument(writeRow.document)
  };
}

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
  attachmentsAdd: AttachmentOperation[];
  attachmentsRemove: AttachmentRemoveOperation[];
  attachmentsUpdate: AttachmentOperation[];
} {
  const hasAttachments = !!storageInstance.schema.attachments;
  const bulkInsertDocs: BulkWriteRow<RxDocType>[] = [];
  const bulkUpdateDocs: BulkWriteRow<RxDocType>[] = [];
  const errors: RxStorageWriteError<RxDocType>[] = [];
  const events: RxStorageChangeEvent<RxDocumentData<RxDocType>>[] = [];
  const attachmentsAdd: AttachmentOperation[] = [];
  const attachmentsRemove: AttachmentRemoveOperation[] = [];
  const attachmentsUpdate: AttachmentOperation[] = [];
  let newestRow: BulkWriteRow<RxDocType> | undefined;

  for (const writeRow of bulkWriteRows) {
    const document = writeRow.document;
    const previous = writeRow.previous;
    const docId = document[primaryPath as keyof RxDocumentData<RxDocType>] as string;
    const documentInDb = docsInDb.get(docId);
    let attachmentError: RxStorageWriteError<RxDocType> | undefined;

    if (!documentInDb) {
      if (hasAttachments && document._attachments) {
        Object.entries(document._attachments).forEach(([attachmentId, attachmentData]) => {
          const attData = attachmentData as RxAttachmentWriteData;
          if (!attData.data) {
            const error: RxStorageWriteError<RxDocType> = {
              documentId: docId,
              isError: true,
              status: 510,
              writeRow,
              attachmentId
            };
            attachmentError = error;
            errors.push(error);
          } else {
            attachmentsAdd.push({
              documentId: docId,
              attachmentId,
              attachmentData: attData,
              digest: attData.digest
            });
          }
        });
      }

      if (!attachmentError) {
        if (hasAttachments) {
          bulkInsertDocs.push(stripAttachmentsDataFromRow(writeRow));
        } else {
          bulkInsertDocs.push(writeRow);
        }
        newestRow = writeRow;
      }

      if (!document._deleted) {
        events.push({
          documentId: docId,
          operation: 'INSERT',
          documentData: hasAttachments ? stripAttachmentsDataFromDocument(document) : document,
          previousDocumentData: hasAttachments && previous ? stripAttachmentsDataFromDocument(previous) : previous
        });
      }
    } else {
      if (!previous || documentInDb._rev !== previous._rev) {
        errors.push({
          isError: true,
          status: 409,
          documentId: docId,
          writeRow,
          documentInDb
        });
        continue;
      }

      const updatedRow = hasAttachments ? stripAttachmentsDataFromRow(writeRow) : writeRow;

      if (hasAttachments) {
        if (document._deleted) {
          if (previous && previous._attachments) {
            Object.keys(previous._attachments).forEach(attachmentId => {
              attachmentsRemove.push({
                documentId: docId,
                attachmentId,
                digest: previous._attachments[attachmentId].digest
              });
            });
          }
        } else if (document._attachments) {
          Object.entries(document._attachments).forEach(([attachmentId, attachmentData]) => {
            const attData = attachmentData as RxAttachmentWriteData;
            const previousAttachmentData = previous && previous._attachments ? previous._attachments[attachmentId] : undefined;
            
            if (!previousAttachmentData) {
              if (!attData.data) {
                const error: RxStorageWriteError<RxDocType> = {
                  documentId: docId,
                  documentInDb,
                  isError: true,
                  status: 510,
                  writeRow,
                  attachmentId
                };
                attachmentError = error;
              } else {
                attachmentsAdd.push({
                  documentId: docId,
                  attachmentId,
                  attachmentData: attData,
                  digest: attData.digest
                });
              }
            } else {
              const newDigest = updatedRow.document._attachments[attachmentId].digest;
              if (attData.data && previousAttachmentData.digest !== newDigest) {
                attachmentsUpdate.push({
                  documentId: docId,
                  attachmentId,
                  attachmentData: attData,
                  digest: attData.digest
                });
              }
            }
          });
        }
      }

      if (attachmentError) {
        errors.push(attachmentError);
      } else {
        bulkUpdateDocs.push(updatedRow);
        newestRow = updatedRow;
      }

      const previousDeleted = previous && previous._deleted;
      const documentDeleted = document._deleted;
      let operation: 'INSERT' | 'UPDATE' | 'DELETE';
      
      if (previousDeleted && !documentDeleted) {
        operation = 'INSERT';
      } else if (!documentDeleted) {
        operation = 'UPDATE';
      } else {
        operation = 'DELETE';
      }

      events.push({
        documentId: docId,
        documentData: hasAttachments ? stripAttachmentsDataFromDocument(document) : document,
        previousDocumentData: previous,
        operation
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
      id: randomToken(10)
    },
    attachmentsAdd,
    attachmentsRemove,
    attachmentsUpdate
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
