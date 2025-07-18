import { registerCompassPlugin } from '@mongodb-js/compass-app-registry';
import { createLoggerLocator } from '@mongodb-js/compass-logging/provider';
import { atlasAuthServiceLocator } from '@mongodb-js/atlas-service/provider';
import { atlasAiServiceLocator } from '@mongodb-js/compass-generative-ai/provider';
import { preferencesLocator } from 'compass-preferences-model/provider';
import SettingsPlugin from './components/index';
import { onActivated } from './stores';

export type { SettingsTabId } from './stores/settings';

export const CompassSettingsPlugin = registerCompassPlugin(
  {
    name: 'CompassSettings',
    component: SettingsPlugin,
    activate: onActivated,
  },
  {
    logger: createLoggerLocator('COMPASS-SETTINGS'),
    preferences: preferencesLocator,
    atlasAiService: atlasAiServiceLocator,
    atlasAuthService: atlasAuthServiceLocator,
  }
);
