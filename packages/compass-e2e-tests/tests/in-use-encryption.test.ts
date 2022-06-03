import { expect } from 'chai';
import semver from 'semver';
import type { CompassBrowser } from '../helpers/compass-browser';
import { beforeTests, afterTests } from '../helpers/compass';
import type { Compass } from '../helpers/compass';
import { MONGODB_VERSION } from '../helpers/compass';
import * as Selectors from '../helpers/selectors';
import { getFirstListDocument } from '../helpers/read-first-document-content';
import { MongoClient } from 'mongodb';
import { ClientEncryption } from 'mongodb-client-encryption';

const CONNECTION_HOSTS = 'localhost:27091';
const CONNECTION_STRING = `mongodb://${CONNECTION_HOSTS}`;

describe('FLE2', function () {
  before(function () {
    if (
      semver.lt(MONGODB_VERSION, '6.0.0-rc0') ||
      process.env.MONGODB_USE_ENTERPRISE !== 'yes'
    ) {
      return this.skip();
    }
  });

  describe('when no encryption options are specified while connecting', function () {
    const databaseName = 'my-db';
    const collectionName = 'my-collection';
    let compass: Compass;
    let browser: CompassBrowser;
    let plainMongo: MongoClient;
    let autoMongo: MongoClient;

    before(async function () {
      compass = await beforeTests();
      browser = compass.browser;
    });

    beforeEach(async function () {
      try {
        const keyVaultNamespace = `${databaseName}.keyvault`;
        const kmsProviders = { local: { key: 'A'.repeat(128) } };
        const keyMongo = await MongoClient.connect(CONNECTION_STRING);
        const clientEncryption = new ClientEncryption(keyMongo, {
          kmsProviders,
          keyVaultNamespace,
        });
        const keyId = await clientEncryption.createDataKey('local');
        const encryptedFields = {
          fields: [
            {
              path: 'phoneNumber',
              keyId,
              bsonType: 'string',
              queries: { queryType: 'equality' },
            },
          ],
        };

        plainMongo = await MongoClient.connect(CONNECTION_STRING);
        autoMongo = await MongoClient.connect(CONNECTION_STRING, {
          autoEncryption: {
            keyVaultNamespace,
            kmsProviders,
            encryptedFieldsMap: encryptedFields,
          },
        });

        await autoMongo.db(databaseName).createCollection(collectionName, {
          encryptedFields,
        });
        await autoMongo.db(databaseName).collection(collectionName).insertOne({
          phoneNumber: '727272',
          name: 'Person Z',
        });

        const doc: any = await plainMongo
          .db(databaseName)
          .collection(collectionName)
          .findOne();

        if (doc) {
          await plainMongo
            .db(databaseName)
            .collection(collectionName)
            .insertOne({
              phoneNumber: doc.phoneNumber,
              faxNumber: doc.phoneNumber,
              name: 'La La',
            });
        }
      } catch (error) {
        console.error('Error during seeding documents:');
        console.error(error);
      }
    });

    after(async function () {
      if (compass) {
        await afterTests(compass, this.currentTest);
      }
    });

    afterEach(async function () {
      await autoMongo?.db(databaseName).dropDatabase();
    });

    it('plainMongo shows the original and the copied fileds as encrypted', async function () {
      await browser.connectWithConnectionForm({
        hosts: [CONNECTION_HOSTS],
      });
      await browser.navigateToCollectionTab(
        databaseName,
        collectionName,
        'Documents'
      );

      const originalDocumentResult = await getFirstListDocument(browser);
      expect(originalDocumentResult.phoneNumber).to.be.equal('*********');

      await browser.runFindOperation('Documents', "{ name: 'La La' }");

      const copiedDocumenResult = await getFirstListDocument(browser);
      expect(copiedDocumenResult.phoneNumber).to.be.equal('*********');
      expect(copiedDocumenResult.faxNumber).to.be.equal('*********');
      expect(copiedDocumenResult._id).to.be.not.equal(
        originalDocumentResult._id
      );
    });

    it('plainMongo can not edit encrypted fields', async function () {
      await browser.connectWithConnectionForm({
        hosts: [CONNECTION_HOSTS],
      });
      await browser.navigateToCollectionTab(
        databaseName,
        collectionName,
        'Documents'
      );

      await browser.runFindOperation('Documents', "{ name: 'Person Z' }");

      const originalDocument = await browser.$(Selectors.DocumentListEntry);
      const originalValue = await originalDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentClickableValue}`
      );
      await originalValue.doubleClick();
      const originalDocumentPhoneNumberEditor = await originalDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentValueEditor}`
      );
      const isOriginalDocumentPhoneNumberEditorExisting =
        await originalDocumentPhoneNumberEditor.isExisting();
      expect(isOriginalDocumentPhoneNumberEditorExisting).to.be.equal(false);

      await browser.runFindOperation('Documents', "{ name: 'La La' }");

      const copiedDocument = await browser.$(Selectors.DocumentListEntry);
      const copiedlValue = await copiedDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentClickableValue}`
      );
      await copiedlValue.doubleClick();
      const copiedDocumentPhoneNumberEditor = await copiedDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentValueEditor}`
      );
      const isCopiedDocumentPhoneNumberEditorExisting =
        await copiedDocumentPhoneNumberEditor.isExisting();
      expect(isCopiedDocumentPhoneNumberEditorExisting).to.be.equal(false);
      const copiedDocumentFaxNumberEditor = await copiedDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(3) ${Selectors.HadronDocumentValueEditor}`
      );
      const isCopiedDocumentFaxNumberEditorExisting =
        await copiedDocumentFaxNumberEditor.isExisting();
      expect(isCopiedDocumentFaxNumberEditorExisting).to.be.equal(false);
      const copiedDocumentNameEditor = await copiedDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(4) ${Selectors.HadronDocumentValueEditor}`
      );
      const isCopiedDocumentNameEditorExisting =
        await copiedDocumentNameEditor.isExisting();
      expect(isCopiedDocumentNameEditorExisting).to.be.equal(true);
    });

    it('autoMongo can not edit the copied encrypted field', async function () {
      await browser.connectWithConnectionForm({
        hosts: [CONNECTION_HOSTS],
        fleKeyVaultNamespace: `${databaseName}.keyvault`,
        fleKey: 'A'.repeat(128),
      });
      await browser.navigateToCollectionTab(
        databaseName,
        collectionName,
        'Documents'
      );

      await browser.runFindOperation('Documents', "{ name: 'Person Z' }");

      const originalDocument = await browser.$(Selectors.DocumentListEntry);
      const originalValue = await originalDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentClickableValue}`
      );
      await originalValue.doubleClick();
      const originalDocumentPhoneNumberEditor = await originalDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentValueEditor}`
      );
      const isOriginalDocumentPhoneNumberEditorExisting =
        await originalDocumentPhoneNumberEditor.isExisting();
      expect(isOriginalDocumentPhoneNumberEditorExisting).to.be.equal(true);

      await browser.runFindOperation('Documents', "{ name: 'La La' }");

      const copiedDocument = await browser.$(Selectors.DocumentListEntry);
      const copiedValue = await copiedDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentClickableValue}`
      );
      await copiedValue.doubleClick();
      const copiedDocumentPhoneNumberEditor = await copiedDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentValueEditor}`
      );
      const isCopiedDocumentPhoneNumberEditorExisting =
        await copiedDocumentPhoneNumberEditor.isExisting();
      expect(isCopiedDocumentPhoneNumberEditorExisting).to.be.equal(true);
      const copiedDocumentFaxNumberEditor = await copiedDocument.$(
        `${Selectors.HadronDocumentElement}:nth-child(3) ${Selectors.HadronDocumentValueEditor}`
      );
      const isCopiedDocumentFaxNumberEditorExisting =
        await copiedDocumentFaxNumberEditor.isExisting();
      expect(isCopiedDocumentFaxNumberEditorExisting).to.be.equal(true);

      await copiedDocumentFaxNumberEditor.setValue('0');

      const button = await copiedDocument.$(
        '[data-test-id="update-document-button"]'
      );
      await button.click();

      const footer = await copiedDocument.$(Selectors.DocumentFooterMessage);
      expect(await footer.getText()).to.equal(
        'Update blocked as it could unintentionally write unencrypted data due to a missing or incomplete schema.'
      );
    });
  });

  describe('when fleEncryptedFieldsMap is not specified while connecting', function () {
    const databaseName = 'db-to-test-fle';
    const collectionName = 'my-encrypted-collection';
    let compass: Compass;
    let browser: CompassBrowser;

    before(async function () {
      compass = await beforeTests();
      browser = compass.browser;

      await browser.connectWithConnectionForm({
        hosts: [CONNECTION_HOSTS],
        fleKeyVaultNamespace: `${databaseName}.keyvault`,
        fleKey: 'A'.repeat(128),
      });
    });

    after(async function () {
      if (compass) {
        await afterTests(compass, this.currentTest);
      }
    });

    beforeEach(async function () {
      await browser.shellEval(
        `db.getMongo().getDB('${databaseName}').createCollection('default')`
      );
      await browser.clickVisible(Selectors.SidebarInstanceRefreshButton);
    });

    it('can create a fle2 collection with encryptedFields', async function () {
      await browser.navigateToDatabaseTab(databaseName, 'Collections');

      // open the create collection modal from the button at the top
      await browser.clickVisible(Selectors.DatabaseCreateCollectionButton);
      await browser.addCollection(collectionName, {
        encryptedFields: `{
            fields: [{
              path: 'phoneNumber',
              keyId: UUID("fd6275d7-9260-4e6c-a86b-68ec5240814a"),
              bsonType: 'string',
              queries: { queryType: 'equality' }
            }]
          }`,
      });

      const collectionListFLE2BadgeElement = await browser.$(
        Selectors.CollectionListFLE2Badge
      );
      const collectionListFLE2BadgeElementText =
        await collectionListFLE2BadgeElement.getText();
      expect(collectionListFLE2BadgeElementText).to.equal(
        'QUERYABLE ENCRYPTION'
      );

      await browser.navigateToCollectionTab(
        databaseName,
        collectionName,
        'Documents'
      );

      const collectionHeaderLE2BadgeElement = await browser.$(
        Selectors.CollectionHeaderFLE2Badge
      );
      const collectionHeaderLE2BadgeElementText =
        await collectionHeaderLE2BadgeElement.getText();
      expect(collectionHeaderLE2BadgeElementText).to.include(
        'QUERYABLE ENCRYPTION'
      );
    });
  });

  describe('when fleEncryptedFieldsMap is specified while connecting', function () {
    const databaseName = 'fle-test';
    const collectionName = 'my-another-collection';
    let compass: Compass;
    let browser: CompassBrowser;

    before(async function () {
      compass = await beforeTests();
      browser = compass.browser;
    });

    beforeEach(async function () {
      await browser.connectWithConnectionForm({
        hosts: [CONNECTION_HOSTS],
        fleKeyVaultNamespace: `${databaseName}.keyvault`,
        fleKey: 'A'.repeat(128),
        fleEncryptedFieldsMap: `{
          '${databaseName}.${collectionName}': {
            fields: [
              {
                path: 'phoneNumber',
                keyId: UUID("28bbc608-524e-4717-9246-33633361788e"),
                bsonType: 'string',
                queries: { queryType: 'equality' }
              }
            ]
          }
        }`,
      });
      await browser.shellEval(`use ${databaseName}`);
      await browser.shellEval(
        'db.keyvault.insertOne({' +
          '"_id": UUID("28bbc608-524e-4717-9246-33633361788e"),' +
          '"keyMaterial": BinData(0, "/yeYyj8IxowIIZGOs5iUcJaUm7KHhoBDAAzNxBz8c5mr2hwBIsBWtDiMU4nhx3fCBrrN3cqXG6jwPgR22gZDIiMZB5+xhplcE9EgNoEEBtRufBE2VjtacpXoqrMgW0+m4Dw76qWUCsF/k1KxYBJabM35KkEoD6+BI1QxU0rwRsR1rE/OLuBPKOEq6pmT5x74i+ursFlTld+5WiOySRDcZg=="),' +
          '"creationDate": ISODate("2022-05-27T18:28:33.925Z"),' +
          '"updateDate": ISODate("2022-05-27T18:28:33.925Z"),' +
          '"status": 0,' +
          '"masterKey": { "provider" : "local" }' +
          '})'
      );
      await browser.clickVisible(Selectors.SidebarInstanceRefreshButton);
    });

    after(async function () {
      if (compass) {
        await afterTests(compass, this.currentTest);
      }
    });

    afterEach(async function () {
      await browser.shellEval(
        `db.getMongo().getDB('${databaseName}').dropDatabase()`
      );
    });

    it('can create a fle2 collection without encryptedFields', async function () {
      await browser.navigateToDatabaseTab(databaseName, 'Collections');
      await browser.clickVisible(Selectors.DatabaseCreateCollectionButton);
      await browser.addCollection(collectionName);

      const selector = Selectors.collectionCard(databaseName, collectionName);
      await browser.scrollToVirtualItem(
        Selectors.CollectionsGrid,
        selector,
        'grid'
      );

      const collectionCard = await browser.$(selector);
      await collectionCard.waitForDisplayed();

      const collectionListFLE2BadgeElement = await browser.$(
        Selectors.CollectionListFLE2Badge
      );
      const collectionListFLE2BadgeElementText =
        await collectionListFLE2BadgeElement.getText();
      expect(collectionListFLE2BadgeElementText).to.equal(
        'QUERYABLE ENCRYPTION'
      );

      await browser.navigateToCollectionTab(
        databaseName,
        collectionName,
        'Documents'
      );

      const collectionHeaderLE2BadgeElement = await browser.$(
        Selectors.CollectionHeaderFLE2Badge
      );
      const collectionHeaderLE2BadgeElementText =
        await collectionHeaderLE2BadgeElement.getText();
      expect(collectionHeaderLE2BadgeElementText).to.include(
        'QUERYABLE ENCRYPTION'
      );
    });

    it('can insert a document with an encrypted field and a non-encrypted field', async function () {
      await browser.shellEval(`db.createCollection('${collectionName}')`);

      await browser.clickVisible(Selectors.SidebarInstanceRefreshButton);

      await browser.navigateToCollectionTab(
        databaseName,
        collectionName,
        'Documents'
      );

      // browse to the "Insert to Collection" modal
      await browser.clickVisible(Selectors.AddDataButton);
      const insertDocumentOption = await browser.$(
        Selectors.InsertDocumentOption
      );
      await insertDocumentOption.waitForDisplayed();
      await browser.clickVisible(Selectors.InsertDocumentOption);

      // wait for the modal to appear
      const insertDialog = await browser.$(Selectors.InsertDialog);
      await insertDialog.waitForDisplayed();

      // set the text in the editor
      await browser.setAceValue(
        Selectors.InsertJSONEditor,
        '{ "phoneNumber": "30303030", "name": "Person X" }'
      );

      const insertCSFLEHasKnownSchemaMsg = await browser.$(
        Selectors.insertCSFLEHasKnownSchemaMsg
      );
      const insertCSFLEHasKnownSchemaMsgText =
        await insertCSFLEHasKnownSchemaMsg.getText();
      expect(insertCSFLEHasKnownSchemaMsgText).to.include('phoneNumber');

      // confirm
      const insertConfirm = await browser.$(Selectors.InsertConfirm);
      await insertConfirm.waitForEnabled();
      await browser.clickVisible(Selectors.InsertConfirm);

      // wait for the modal to go away
      await insertDialog.waitForDisplayed({ reverse: true });
      await browser.clickVisible(Selectors.SidebarInstanceRefreshButton);

      const result = await getFirstListDocument(browser);

      expect(result._id).to.exist;
      expect(result.__safeContent__).to.exist;
      delete result._id;
      delete result.__safeContent__;

      expect(result).to.deep.equal({
        phoneNumber: '"30303030"',
        name: '"Person X"',
      });
    });

    it('shows a decrypted field icon', async function () {
      await browser.shellEval(`db.createCollection('${collectionName}')`);
      await browser.shellEval(
        `db['${collectionName}'].insertOne({ "phoneNumber": "30303030", "name": "Person X" })`
      );

      await browser.navigateToCollectionTab(
        databaseName,
        collectionName,
        'Documents'
      );

      const decryptedIconElements = await browser.$$(
        Selectors.documentListDecryptedIcon(1)
      );
      const decryptedIcons = await Promise.all(
        decryptedIconElements.map((el) => el.getAttribute('title'))
      );

      expect(decryptedIcons).to.have.lengthOf(1);
      expect(decryptedIcons[0]).to.be.equal('Encrypted Field');
    });

    it('can edit and query the encrypted field', async function () {
      await browser.shellEval(`db.createCollection('${collectionName}')`);
      await browser.shellEval(
        `db['${collectionName}'].insertOne({ "phoneNumber": "30303030", "name": "Person X" })`
      );

      await browser.navigateToCollectionTab(
        databaseName,
        collectionName,
        'Documents'
      );

      const result = await getFirstListDocument(browser);
      expect(result.phoneNumber).to.be.equal('"30303030"');

      const document = await browser.$(Selectors.DocumentListEntry);
      const value = await document.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentClickableValue}`
      );
      await value.doubleClick();

      const input = await document.$(
        `${Selectors.HadronDocumentElement}:nth-child(2) ${Selectors.HadronDocumentValueEditor}`
      );
      await input.setValue('10101010');

      const footer = await document.$(Selectors.DocumentFooterMessage);
      expect(await footer.getText()).to.equal('Document Modified.');

      const button = await document.$(
        '[data-test-id="update-document-button"]'
      );
      await button.click();
      await footer.waitForDisplayed({ reverse: true });

      await browser.runFindOperation(
        'Documents',
        "{ phoneNumber: '10101010' }"
      );

      const modifiedResult = await getFirstListDocument(browser);
      expect(modifiedResult.phoneNumber).to.be.equal('"10101010"');
      expect(modifiedResult._id).to.be.equal(result._id);
    });
  });
});
