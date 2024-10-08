import type { ActivateHelpers } from 'hadron-app-registry';
import { registerHadronPlugin, type AppRegistry } from 'hadron-app-registry';
import SidebarPlugin from './plugin';
import { createSidebarStore } from './stores';
import {
  type MongoDBInstancesManager,
  mongoDBInstancesManagerLocator,
} from '@mongodb-js/compass-app-stores/provider';
import {
  type ConnectionsManager,
  connectionsManagerLocator,
} from '@mongodb-js/compass-connections/provider';
import type { Logger } from '@mongodb-js/compass-logging/provider';
import { createLoggerLocator } from '@mongodb-js/compass-logging/provider';

export const CompassSidebarPlugin = registerHadronPlugin(
  {
    name: 'CompassSidebar',
    component: SidebarPlugin,
    activate(
      _initialProps,
      {
        globalAppRegistry,
        connectionsManager,
        instancesManager,
        logger,
      }: {
        globalAppRegistry: AppRegistry;
        connectionsManager: ConnectionsManager;
        instancesManager: MongoDBInstancesManager;
        logger: Logger;
      },
      helpers: ActivateHelpers
    ) {
      const { store, deactivate } = createSidebarStore(
        {
          globalAppRegistry,
          connectionsManager,
          instancesManager,
          logger,
        },
        helpers
      );
      return {
        store,
        deactivate,
      };
    },
  },
  {
    connectionsManager: connectionsManagerLocator,
    instancesManager: mongoDBInstancesManagerLocator,
    logger: createLoggerLocator('COMPASS-SIDEBAR-UI'),
  }
);
