import React from 'react';
import type { DocumentProps } from './components/document';
import Document from './components/document';
import type { DocumentListProps } from './components/document-list';
import DocumentList from './components/document-list';
import InsertDocumentDialog from './components/insert-document-dialog';
import {
  type EmittedAppRegistryEvents,
  activateDocumentsPlugin,
} from './stores/crud-store';
import {
  connectionInfoRefLocator,
  connectionScopedAppRegistryLocator,
  dataServiceLocator,
  type DataServiceLocator,
} from '@mongodb-js/compass-connections/provider';
import type {
  OptionalDataServiceProps,
  RequiredDataServiceProps,
} from './utils/data-service';
import {
  collectionModelLocator,
  mongoDBInstanceLocator,
} from '@mongodb-js/compass-app-stores/provider';
import { registerCompassPlugin } from '@mongodb-js/compass-app-registry';
import { preferencesLocator } from 'compass-preferences-model/provider';
import { createLoggerLocator } from '@mongodb-js/compass-logging/provider';
import {
  favoriteQueryStorageAccessLocator,
  recentQueryStorageAccessLocator,
} from '@mongodb-js/my-queries-storage/provider';
import { fieldStoreServiceLocator } from '@mongodb-js/compass-field-store';
import { queryBarServiceLocator } from '@mongodb-js/compass-query-bar';
import { telemetryLocator } from '@mongodb-js/compass-telemetry/provider';
import { CrudTabTitle } from './plugin-title';

const CompassDocumentsPluginProvider = registerCompassPlugin(
  {
    name: 'CompassDocuments',
    component: function CrudProvider({ children, ...props }) {
      return React.createElement(
        React.Fragment,
        null,
        // Cloning children with props is a workaround for reflux store.
        React.isValidElement(children)
          ? React.cloneElement(children, props)
          : null
      );
    },
    activate: activateDocumentsPlugin,
  },
  {
    dataService: dataServiceLocator as DataServiceLocator<
      RequiredDataServiceProps,
      OptionalDataServiceProps
    >,
    instance: mongoDBInstanceLocator,
    preferences: preferencesLocator,
    logger: createLoggerLocator('COMPASS-CRUD-UI'),
    track: telemetryLocator,
    favoriteQueryStorageAccess: favoriteQueryStorageAccessLocator,
    recentQueryStorageAccess: recentQueryStorageAccessLocator,
    fieldStoreService: fieldStoreServiceLocator,
    connectionInfoRef: connectionInfoRefLocator,
    connectionScopedAppRegistry:
      connectionScopedAppRegistryLocator<EmittedAppRegistryEvents>,
    queryBar: queryBarServiceLocator,
    collection: collectionModelLocator,
  }
);

export const CompassDocumentsPlugin = {
  name: 'Documents' as const,
  provider: CompassDocumentsPluginProvider,
  content: DocumentList as any, // as any because of reflux store
  header: CrudTabTitle as any, // as any because of reflux store
};

export default DocumentList;
export type { DocumentListProps, DocumentProps };
export { DocumentList, Document, InsertDocumentDialog };
export type { DocumentListViewProps } from './components/document-list-view';
export { default as DocumentListView } from './components/document-list-view';
export type { DocumentJsonViewProps } from './components/document-json-view';
export { default as DocumentJsonView } from './components/document-json-view';
