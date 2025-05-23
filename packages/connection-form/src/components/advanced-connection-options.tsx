import React from 'react';
import {
  Accordion,
  spacing,
  css,
  rgba,
  palette,
} from '@mongodb-js/compass-components';
import type { ConnectionOptions } from 'mongodb-data-service';

import AdvancedOptionsTabs from './advanced-options-tabs/advanced-options-tabs';
import type { UpdateConnectionFormField } from '../hooks/use-connect-form';
import type { ConnectionFormError } from '../utils/validation';

const disabledOverlayStyles = css({
  position: 'absolute',
  top: 0,
  // Space around it to ensure added focus borders are covered.
  bottom: -spacing[100],
  left: -spacing[100],
  right: -spacing[100],
  backgroundColor: rgba(palette.white, 0.5),
  zIndex: 1,
  cursor: 'not-allowed',
});

const connectionTabsContainer = css({
  position: 'relative',
});

function AdvancedConnectionOptions({
  disabled,
  errors,
  updateConnectionFormField,
  connectionOptions,
  open,
  setOpen,
  openSettingsModal,
}: {
  errors: ConnectionFormError[];
  disabled: boolean;
  updateConnectionFormField: UpdateConnectionFormField;
  connectionOptions: ConnectionOptions;
  openSettingsModal?: (tab?: string) => void;
} & Pick<
  React.ComponentProps<typeof Accordion>,
  'open' | 'setOpen'
>): React.ReactElement {
  return (
    <Accordion
      data-testid="advanced-connection-options"
      text="Advanced Connection Options"
      open={open}
      setOpen={setOpen}
    >
      <div className={connectionTabsContainer}>
        {disabled && (
          <div
            className={disabledOverlayStyles}
            title="The connection form is disabled when the connection string cannot be parsed."
          />
        )}
        <AdvancedOptionsTabs
          errors={errors}
          updateConnectionFormField={updateConnectionFormField}
          connectionOptions={connectionOptions}
          openSettingsModal={openSettingsModal}
        />
      </div>
    </Accordion>
  );
}

export default AdvancedConnectionOptions;
