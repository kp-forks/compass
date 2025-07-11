import React from 'react';
import { registerCompassPlugin } from '@mongodb-js/compass-app-registry';
import { AggregationsPlugin } from './plugin';
import { activateAggregationsPlugin } from './stores/store';
import { Aggregations } from './components/aggregations';
import { activateCreateViewPlugin } from './stores/create-view';
import StageEditor from './components/stage-editor';
import CreateViewModal from './components/create-view-modal';
import {
  connectionInfoRefLocator,
  connectionScopedAppRegistryLocator,
  connectionsLocator,
  dataServiceLocator,
  type DataServiceLocator,
} from '@mongodb-js/compass-connections/provider';
import { createLoggerLocator } from '@mongodb-js/compass-logging/provider';
import { telemetryLocator } from '@mongodb-js/compass-telemetry/provider';
import type {
  OptionalDataServiceProps,
  RequiredDataServiceProps,
} from './modules/data-service';
import {
  collectionModelLocator,
  mongoDBInstanceLocator,
} from '@mongodb-js/compass-app-stores/provider';
import { workspacesServiceLocator } from '@mongodb-js/compass-workspaces/provider';
import { preferencesLocator } from 'compass-preferences-model/provider';
import { atlasAiServiceLocator } from '@mongodb-js/compass-generative-ai/provider';
import { pipelineStorageLocator } from '@mongodb-js/my-queries-storage/provider';
import { AggregationsTabTitle } from './plugin-title';

const CompassAggregationsPluginProvider = registerCompassPlugin(
  {
    name: 'CompassAggregations',
    component: function AggregationsProvider({ children }) {
      return React.createElement(React.Fragment, null, children);
    },
    activate: activateAggregationsPlugin,
  },
  {
    dataService: dataServiceLocator as DataServiceLocator<
      RequiredDataServiceProps,
      OptionalDataServiceProps
    >,
    workspaces: workspacesServiceLocator,
    instance: mongoDBInstanceLocator,
    preferences: preferencesLocator,
    logger: createLoggerLocator('COMPASS-AGGREGATIONS-UI'),
    track: telemetryLocator,
    atlasAiService: atlasAiServiceLocator,
    pipelineStorage: pipelineStorageLocator,
    connectionInfoRef: connectionInfoRefLocator,
    collection: collectionModelLocator,
    connectionScopedAppRegistry:
      connectionScopedAppRegistryLocator<'open-export'>,
  }
);

export const CompassAggregationsPlugin = {
  name: 'Aggregations' as const,
  provider: CompassAggregationsPluginProvider,
  content: AggregationsPlugin,
  header: AggregationsTabTitle,
};

export const CreateViewPlugin = registerCompassPlugin(
  {
    name: 'CreateView',
    component: CreateViewModal,
    activate: activateCreateViewPlugin,
  },
  {
    connections: connectionsLocator,
    logger: createLoggerLocator('COMPASS-CREATE-VIEW-UI'),
    track: telemetryLocator,
    workspaces: workspacesServiceLocator,
  }
);

export default AggregationsPlugin;
export { Aggregations, StageEditor };
