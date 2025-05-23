import {
  Body,
  spacing,
  css,
  TextInput,
  Combobox,
  ComboboxWithCustomOption,
  ComboboxOption,
} from '@mongodb-js/compass-components';
import React, { useCallback, useMemo, useState } from 'react';
import { connect } from 'react-redux';
import type { RootState } from '../../../../modules';
import { fetchCollectionFields } from '../../../../modules/collections-fields';
import type { CollectionData } from '../../../../modules/collections-fields';
import type { WizardComponentProps } from '..';
import { FieldCombobox } from '../field-combobox';

const LOOKUP_TITLE = 'Join documents from';

type LookupFormState = {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
};

const containerStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[200],
});

const titleStyles = css({
  minWidth: `${LOOKUP_TITLE.length}ch`,
  textAlign: 'right',
});

const formGroup = css({
  display: 'flex',
  gap: spacing[200],
  alignItems: 'center',
});

const inputFieldStyles = css({
  width: '300px',
});

type LookupOwnProps = WizardComponentProps;
type MappedProps = {
  collectionsFields: Record<string, CollectionData>;
  onSelectCollection: (collection: string) => void;
};
type LookupProps = LookupOwnProps & MappedProps;

export const LookupForm = ({
  fields,
  collectionsFields,
  onSelectCollection,
  onChange,
}: LookupProps) => {
  const [formData, setFormData] = useState<LookupFormState>({
    as: '',
    from: '',
    foreignField: '',
    localField: '',
  });

  const onSelectOption = useCallback(
    (option: keyof LookupFormState, value: string | null) => {
      if (value === null) {
        return;
      }

      // We set the "as" form field if:
      // 1. The value was not set initially and
      // 2. The value was set initially programmatically and
      //  was not changed by the user or the value is empty
      const newData: LookupFormState = { ...formData, [option]: value };
      if (
        option === 'from' &&
        (!formData.as || formData.from === formData.as)
      ) {
        newData.as = value;
      }

      // Call onChange with the new value and an error if any of the fields is empty
      const anyEmptyValue = Object.values(newData).some((x) => !x);
      onChange(
        JSON.stringify(newData),
        anyEmptyValue ? new Error('Enter all the fields') : null
      );

      // Fetch the fields of the selected collection if it was changed
      if (option === 'from' && newData.from !== formData.from) {
        onSelectCollection(newData.from);
      }

      setFormData(newData);
    },
    [formData, setFormData, onChange, onSelectCollection]
  );

  const collectionInfo = useMemo(
    () => (formData.from ? collectionsFields[formData.from] : null),
    [formData.from, collectionsFields]
  );

  return (
    <div className={containerStyles}>
      <div className={formGroup}>
        <Body className={titleStyles}>{LOOKUP_TITLE}</Body>
        <Combobox
          aria-label="Select collection"
          placeholder="Select collection"
          value={formData.from}
          clearable={false}
          className={inputFieldStyles}
          onChange={(value: string | null) => onSelectOption('from', value)}
        >
          {Object.keys(collectionsFields).map((coll, index) => (
            <ComboboxOption key={index} value={coll} />
          ))}
        </Combobox>
      </div>
      <div className={formGroup}>
        <Body className={titleStyles}>where</Body>
        <ComboboxWithCustomOption
          className={inputFieldStyles}
          aria-label="Select foreign field"
          placeholder="Select foreign field"
          size="default"
          clearable={false}
          onChange={(value: string | null) =>
            onSelectOption('foreignField', value)
          }
          searchState={(() => {
            if (collectionInfo?.isLoading) {
              return 'loading';
            }
            if (collectionInfo?.error) {
              return 'error';
            }
            return 'unset';
          })()}
          searchLoadingMessage="Fetching fields ..."
          searchErrorMessage={
            'Failed to fetch the fields. Type the field name manually.'
          }
          searchEmptyMessage={
            !formData.from ? 'Select a collection first.' : undefined
          }
          options={(collectionInfo?.fields ?? []).map((x) => ({ value: x }))}
          renderOption={(option, index) => {
            return (
              <ComboboxOption
                key={index}
                value={option.value}
                displayName={option.value}
              />
            );
          }}
        />
      </div>
      <div className={formGroup}>
        <Body className={titleStyles}>matches</Body>
        <FieldCombobox
          className={inputFieldStyles}
          aria-label="Select local field"
          placeholder="Select local field"
          clearable={false}
          onChange={(value: string | null) =>
            onSelectOption('localField', value)
          }
          fields={fields}
        />
      </div>
      <div className={formGroup}>
        <Body
          aria-label="Name of the array"
          id="lookup-stage-as-input-label"
          className={titleStyles}
        >
          as
        </Body>
        <div className={inputFieldStyles}>
          <TextInput
            value={formData.as}
            title="Name of the array"
            aria-labelledby="lookup-stage-as-input-label"
            data-testid="name-of-the-array-input"
            placeholder="Name of the array"
            onChange={(e) => onSelectOption('as', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

export default connect(
  (state: RootState) => ({
    collectionsFields: state.collectionsFields,
  }),
  {
    onSelectCollection: fetchCollectionFields,
  }
)(LookupForm);
