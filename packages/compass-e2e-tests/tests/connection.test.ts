import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import ConnectionString from 'mongodb-connection-string-url';
import resolveMongodbSrv from 'resolve-mongodb-srv';
import type { CompassBrowser } from '../helpers/compass-browser';
import {
  init,
  cleanup,
  screenshotIfFailed,
  serverSatisfies,
  skipForWeb,
  TEST_COMPASS_WEB,
  TEST_MULTIPLE_CONNECTIONS,
  connectionNameFromString,
  DEFAULT_CONNECTION_NAME,
  MONGODB_TEST_SERVER_PORT,
} from '../helpers/compass';
import type { Compass } from '../helpers/compass';
import type { ConnectFormState } from '../helpers/connect-form-state';
import * as Selectors from '../helpers/selectors';

async function disconnect(browser: CompassBrowser) {
  try {
    await browser.disconnectAll();
  } catch (err) {
    console.error('Error during disconnect:');
    console.error(err);
  }
}

function hasAtlasEnvironmentVariables(): boolean {
  const missingKeys = [
    'E2E_TESTS_ATLAS_HOST',
    'E2E_TESTS_DATA_LAKE_HOST',
    'E2E_TESTS_ANALYTICS_NODE_HOST',
    'E2E_TESTS_SERVERLESS_HOST',
    'E2E_TESTS_FREE_TIER_HOST',
    'E2E_TESTS_ATLAS_USERNAME',
    'E2E_TESTS_ATLAS_PASSWORD',
    'E2E_TESTS_ATLAS_X509_PEM',
    'E2E_TESTS_ATLAS_IAM_ACCESS_KEY_ID',
    'E2E_TESTS_ATLAS_IAM_SECRET_ACCESS_KEY',
    'E2E_TESTS_ATLAS_IAM_TEMP_ROLE_ARN',
    'E2E_TESTS_ATLAS_IAM_USER_ARN',
    'E2E_TESTS_ATLAS_READWRITEANY_STRING',
    'E2E_TESTS_ATLAS_READANYDATABASE_STRING',
    'E2E_TESTS_ATLAS_CUSTOMROLE_STRING',
    'E2E_TESTS_ATLAS_SPECIFICPERMISSION_STRING',
  ].filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    const keysStr = missingKeys.join(', ');
    if (process.env.ci || process.env.CI) {
      throw new Error(`Missing required environmental variable(s): ${keysStr}`);
    }
    return false;
  }

  return true;
}

function basicAtlasOptions(host: string): ConnectFormState {
  const username = process.env.E2E_TESTS_ATLAS_USERNAME ?? '';
  const password = process.env.E2E_TESTS_ATLAS_PASSWORD ?? '';

  const atlasConnectionOptions: ConnectFormState = {
    hosts: [host],
    authMethod: 'DEFAULT',
    defaultUsername: username,
    defaultPassword: password,
    defaultAuthMechanism: 'SCRAM-SHA-1',
    scheme: 'MONGODB_SRV',
  };

  return atlasConnectionOptions;
}

function generateIamSessionToken(): {
  key: string;
  secret: string;
  token: string;
} {
  const result = spawnSync(
    'aws',
    [
      'sts',
      'assume-role',
      '--role-arn',
      process.env.E2E_TESTS_ATLAS_IAM_TEMP_ROLE_ARN ?? '',
      '--role-session-name',
      'MONGODB-AWS-AUTH-TEST',
      '--duration-seconds',
      '900', // test timeout is 120, waitForX is 10. minimum allowed value is 900.
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: process.env.E2E_TESTS_ATLAS_IAM_ACCESS_KEY_ID ?? '',
        AWS_SECRET_ACCESS_KEY:
          process.env.E2E_TESTS_ATLAS_IAM_SECRET_ACCESS_KEY ?? '',
      },
    }
  );
  if (result.status !== 0) {
    console.error('Failed to run aws sts assume-role', result);
    throw new Error('Failed to run aws sts assume-role');
  }

  const parsedToken = JSON.parse(result.stdout);
  const key = parsedToken?.Credentials?.AccessKeyId;
  const secret = parsedToken?.Credentials?.SecretAccessKey;
  const token = parsedToken?.Credentials?.SessionToken;
  if (!key || !secret || !token) {
    throw new Error(
      'Could not determine key, token, or secret from sts assume-role output'
    );
  }
  return {
    key,
    secret,
    token,
  };
}

async function assertCanReadData(
  browser: CompassBrowser,
  connectionName: string,
  dbName: string,
  collectionName: string
): Promise<void> {
  await browser.navigateToCollectionTab(
    connectionName,
    dbName,
    collectionName,
    'Documents'
  );
  await browser.waitUntil(async () => {
    const text = await browser
      .$(Selectors.DocumentListActionBarMessage)
      .getText();
    return /\d+ – \d+ of \d+/.test(text);
  });
}

async function assertCannotInsertData(
  browser: CompassBrowser,
  connectionName: string,
  dbName: string,
  collectionName: string
): Promise<void> {
  await browser.navigateToCollectionTab(
    connectionName,
    dbName,
    collectionName,
    'Documents'
  );

  // browse to the "Insert to Collection" modal
  await browser.clickVisible(Selectors.AddDataButton);
  const insertDocumentOption = await browser.$(Selectors.InsertDocumentOption);
  await insertDocumentOption.waitForDisplayed();
  await browser.clickVisible(Selectors.InsertDocumentOption);

  // wait for the modal to appear
  const insertDialog = await browser.$(Selectors.InsertDialog);
  await insertDialog.waitForDisplayed();

  // go with the default text which should just be a random new id and therefore valid

  // confirm
  const insertConfirm = await browser.$(Selectors.InsertConfirm);
  // this selector is very brittle, so just make sure it works
  expect(await insertConfirm.isDisplayed()).to.be.true;
  expect(await insertConfirm.getText()).to.equal('Insert');
  await insertConfirm.waitForEnabled();
  await browser.clickVisible(Selectors.InsertConfirm);

  // make sure that there's an error and that the insert button is disabled
  const errorElement = await browser.$(Selectors.InsertDialogErrorMessage);
  await errorElement.waitForDisplayed();
  expect(await errorElement.getText()).to.contain(
    `not authorized on ${dbName} to execute command`
  );

  // cancel and wait for the modal to go away
  await browser.clickVisible(Selectors.InsertCancel);
  await insertDialog.waitForDisplayed({ reverse: true });
}

async function assertCannotCreateDb(
  browser: CompassBrowser,
  connectionName: string,
  dbName: string,
  collectionName: string
): Promise<void> {
  const Sidebar = TEST_MULTIPLE_CONNECTIONS
    ? Selectors.Multiple
    : Selectors.Single;

  if (TEST_MULTIPLE_CONNECTIONS) {
    // navigate to the databases tab so that the connection is
    // active/highlighted and then the add button and three dot menu will
    // display without needing to hover
    await browser.navigateToConnectionTab(connectionName, 'Databases');
  }

  // open the create database modal from the sidebar
  if (TEST_MULTIPLE_CONNECTIONS) {
    await browser.selectConnectionMenuItem(
      connectionName,
      Sidebar.CreateDatabaseButton,
      false
    );
  } else {
    await browser.clickVisible(Sidebar.CreateDatabaseButton);
  }

  const createModalElement = await browser.$(Selectors.CreateDatabaseModal);
  await createModalElement.waitForDisplayed();
  await browser.setValueVisible(Selectors.CreateDatabaseDatabaseName, dbName);
  await browser.setValueVisible(
    Selectors.CreateDatabaseCollectionName,
    collectionName
  );
  const createButton = await browser.$(Selectors.CreateDatabaseCreateButton);
  await createButton.waitForEnabled();
  await createButton.click();

  // an error should appear
  const errorElement = await browser.$(Selectors.CreateDatabaseErrorMessage);
  await errorElement.waitForDisplayed();
  expect(await errorElement.getText()).to.contain(
    `not authorized on ${dbName} to execute command`
  );

  await browser.screenshot('create-database-modal-error.png');

  // cancel and wait for the modal to go away
  await browser.clickVisible(Selectors.CreateDatabaseCancelButton);
  await createModalElement.waitForDisplayed({ reverse: true });
}

async function assertCannotCreateCollection(
  browser: CompassBrowser,
  connectionName: string,
  dbName: string,
  collectionName: string
): Promise<void> {
  const connectionId = await browser.getConnectionIdByName(connectionName);

  // open create collection modal from the sidebar
  await browser.clickVisible(Selectors.SidebarFilterInput);
  await browser.setValueVisible(Selectors.SidebarFilterInput, dbName);
  const dbElement = await browser.$(
    Selectors.sidebarDatabase(connectionId, dbName)
  );
  await dbElement.waitForDisplayed();
  await browser.hover(Selectors.sidebarDatabase(connectionId, dbName));
  await browser.clickVisible(Selectors.CreateCollectionButton);

  const createModalElement = await browser.$(Selectors.CreateCollectionModal);
  await createModalElement.waitForDisplayed();
  await browser.setValueVisible(
    Selectors.CreateDatabaseCollectionName,
    collectionName
  );

  await browser.clickVisible(Selectors.CreateCollectionCreateButton);

  // an error should appear
  const errorElement = await browser.$(Selectors.CreateCollectionErrorMessage);
  await errorElement.waitForDisplayed();
  expect(await errorElement.getText()).to.contain(
    `not authorized on ${dbName} to execute command`
  );

  await browser.screenshot('create-collection-modal-error.png');

  // cancel and wait for the modal to go away
  await browser.clickVisible(Selectors.CreateCollectionCancelButton);
  await createModalElement.waitForDisplayed({ reverse: true });
}

/**
 * Connection tests
 */
describe('Connection string', function () {
  let compass: Compass;
  let browser: CompassBrowser;

  before(async function () {
    compass = await init(this.test?.fullTitle());
    browser = compass.browser;
  });

  after(function () {
    return cleanup(compass);
  });

  afterEach(async function () {
    await screenshotIfFailed(compass, this.currentTest);
    await disconnect(browser); // disconnect AFTER potentially taking a screenshot
  });

  it('can connect using connection string', async function () {
    await browser.connectWithConnectionString();
    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        DEFAULT_CONNECTION_NAME,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }
  });

  it('fails for authentication errors', async function () {
    skipForWeb(this, 'connect happens on the outside');

    await browser.connectWithConnectionString(
      `mongodb://a:b@127.0.0.1:${MONGODB_TEST_SERVER_PORT}/test`,
      'failure'
    );
    if (TEST_MULTIPLE_CONNECTIONS) {
      const toastTitle = await browser.$(Selectors.LGToastTitle).getText();
      expect(toastTitle).to.equal('Authentication failed.');

      const errorMessage = await browser
        .$(Selectors.ConnectionToastErrorText)
        .getText();
      expect(errorMessage).to.equal(
        'There was a problem connecting to 127.0.0.1:27091'
      );
    } else {
      const errorMessage = await browser
        .$(Selectors.ConnectionFormErrorMessage)
        .getText();
      expect(errorMessage).to.equal('Authentication failed.');
    }
  });

  it('can connect to an Atlas replicaset without srv', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const username = process.env.E2E_TESTS_ATLAS_USERNAME ?? '';
    const password = process.env.E2E_TESTS_ATLAS_PASSWORD ?? '';
    const host = process.env.E2E_TESTS_ATLAS_HOST ?? '';
    const withSRV = `mongodb+srv://${username}:${password}@${host}`;

    const connectionString = await resolveMongodbSrv(withSRV);
    await browser.connectWithConnectionString(connectionString);
    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        connectionNameFromString(connectionString),
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }
  });

  it('can connect to an Atlas cluster with a direct connection', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const username = process.env.E2E_TESTS_ATLAS_USERNAME ?? '';
    const password = process.env.E2E_TESTS_ATLAS_PASSWORD ?? '';
    const host = process.env.E2E_TESTS_ATLAS_HOST ?? '';
    const withSRV = `mongodb+srv://${username}:${password}@${host}`;

    const withoutSRV = await resolveMongodbSrv(withSRV);

    const parsedString = new ConnectionString(withoutSRV);
    parsedString.hosts = [parsedString.hosts[0]];
    parsedString.searchParams.set('directConnection', 'true');
    parsedString.searchParams.delete('replicaSet');

    const connectionString = parsedString.toString();
    await browser.connectWithConnectionString(connectionString);

    if (!TEST_COMPASS_WEB) {
      await browser.screenshot('direct-connection-shell.png');
      const result = await browser.shellEval(
        connectionNameFromString(connectionString),
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }
  });

  it('can connect to Atlas Serverless', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const username = process.env.E2E_TESTS_ATLAS_USERNAME ?? '';
    const password = process.env.E2E_TESTS_ATLAS_PASSWORD ?? '';
    const host = process.env.E2E_TESTS_SERVERLESS_HOST ?? '';
    const connectionString = `mongodb+srv://${username}:${password}@${host}`;
    const connectionName = connectionNameFromString(connectionString);

    await browser.connectWithConnectionString(connectionString);

    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }
  });

  it('can connect to Atlas Datalake', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const username = process.env.E2E_TESTS_ATLAS_USERNAME ?? '';
    const password = process.env.E2E_TESTS_ATLAS_PASSWORD ?? '';
    const host = process.env.E2E_TESTS_DATA_LAKE_HOST ?? '';
    const connectionString = `mongodb://${username}:${password}@${host}/?authSource=admin&tls=true`;
    const connectionName = connectionNameFromString(connectionString);

    await browser.connectWithConnectionString(connectionString);

    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }
  });

  it('can connect to Atlas Analytics Node', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const username = process.env.E2E_TESTS_ATLAS_USERNAME ?? '';
    const password = process.env.E2E_TESTS_ATLAS_PASSWORD ?? '';
    const host = process.env.E2E_TESTS_ANALYTICS_NODE_HOST ?? '';
    const connectionString = `mongodb+srv://${username}:${password}@${host}`;
    const connectionName = connectionNameFromString(connectionString);

    await browser.connectWithConnectionString(connectionString);

    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }
  });

  it('can connect to Atlas Free Tier', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const username = process.env.E2E_TESTS_ATLAS_USERNAME ?? '';
    const password = process.env.E2E_TESTS_ATLAS_PASSWORD ?? '';
    const host = process.env.E2E_TESTS_FREE_TIER_HOST ?? '';
    const connectionString = `mongodb+srv://${username}:${password}@${host}`;
    const connectionName = connectionNameFromString(connectionString);

    await browser.connectWithConnectionString(connectionString);
    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }
  });

  it('can connect with readWriteAnyDatabase builtin role', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const connectionString =
      process.env.E2E_TESTS_ATLAS_READWRITEANY_STRING ?? '';
    const connectionName = connectionNameFromString(connectionString);

    await browser.connectWithConnectionString(connectionString);

    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }

    await assertCanReadData(
      browser,
      connectionName,
      'compass_e2e',
      'companies_info'
    );
  });

  it('can connect with readAnyDatabase builtin role', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const connectionString =
      process.env.E2E_TESTS_ATLAS_READANYDATABASE_STRING ?? '';

    await browser.connectWithConnectionString(connectionString);

    const connectionName = connectionNameFromString(connectionString);

    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }

    await assertCanReadData(
      browser,
      connectionName,
      'compass_e2e',
      'companies_info'
    );
    await assertCannotInsertData(
      browser,
      connectionName,
      'compass_e2e',
      'companies_info'
    );
    await assertCannotCreateDb(
      browser,
      connectionName,
      'new-db',
      'new-collection'
    );
    await assertCannotCreateCollection(
      browser,
      connectionName,
      'compass_e2e',
      'new-collection'
    );
  });

  it('can connect with custom role', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const connectionString =
      process.env.E2E_TESTS_ATLAS_CUSTOMROLE_STRING ?? '';

    await browser.connectWithConnectionString(connectionString);

    const connectionName = connectionNameFromString(connectionString);

    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }

    await assertCanReadData(browser, connectionName, 'test', 'users');
    await assertCannotCreateDb(
      browser,
      connectionName,
      'new-db',
      'new-collection'
    );
    await assertCannotCreateCollection(
      browser,
      connectionName,
      'test',
      'new-collection'
    );
  });

  it('can connect with read one collection specific permission', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const connectionString =
      process.env.E2E_TESTS_ATLAS_SPECIFICPERMISSION_STRING ?? '';

    await browser.connectWithConnectionString(connectionString);

    const connectionName = connectionNameFromString(connectionString);

    if (!TEST_COMPASS_WEB) {
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    }

    await assertCanReadData(browser, connectionName, 'test', 'users');
    await assertCannotInsertData(browser, connectionName, 'test', 'users');
    await assertCannotCreateDb(
      browser,
      connectionName,
      'new-db',
      'new-collection'
    );
    await assertCannotCreateCollection(
      browser,
      connectionName,
      'test',
      'new-collection'
    );
  });
});

describe('Connection form', function () {
  let compass: Compass;
  let browser: CompassBrowser;

  before(async function () {
    skipForWeb(this, 'connect form not available in compass-web');

    compass = await init(this.test?.fullTitle());
    browser = compass.browser;
  });

  after(function () {
    if (TEST_COMPASS_WEB) {
      return;
    }

    return cleanup(compass);
  });

  afterEach(async function () {
    await screenshotIfFailed(compass, this.currentTest);
    await disconnect(browser); // disconnect AFTER potentially taking a screenshot
  });

  it('can connect using connection form', async function () {
    const connectionName = this.test?.fullTitle() ?? '';

    await browser.connectWithConnectionForm({
      hosts: ['127.0.0.1:27091'],
      connectionName,
    });
    const result = await browser.shellEval(
      connectionName,
      'db.runCommand({ connectionStatus: 1 })',
      true
    );
    assertNotError(result);
    expect(result).to.have.property('ok', 1);
  });

  it('can connect to an Atlas cluster with username/password authentication (SCRAM-SHA-1)', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const connectionName = this.test?.fullTitle() ?? '';

    const atlasConnectionOptions: ConnectFormState = basicAtlasOptions(
      process.env.E2E_TESTS_ATLAS_HOST ?? ''
    );
    await browser.connectWithConnectionForm({
      ...atlasConnectionOptions,
      connectionName,
    });
    await browser.screenshot('SCDAM-SHA1-shell.png');
    const result = await browser.shellEval(
      connectionName,
      'db.runCommand({ connectionStatus: 1 })',
      true
    );
    assertNotError(result);
    expect(result).to.have.property('ok', 1);
  });

  it('can connect to an Atlas cluster with X.509 authentication', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const connectionName = this.test?.fullTitle() ?? '';

    let tempdir;
    try {
      tempdir = await fs.mkdtemp(path.join(os.tmpdir(), 'connect-tests-'));
      const certPath = path.join(tempdir, 'x509.pem');
      await fs.writeFile(certPath, process.env.E2E_TESTS_ATLAS_X509_PEM ?? '');

      const atlasConnectionOptions: ConnectFormState = {
        hosts: [process.env.E2E_TESTS_ATLAS_HOST ?? ''],
        authMethod: 'MONGODB-X509',
        scheme: 'MONGODB_SRV',
        sslConnection: 'ON',
        tlsCertificateKeyFile: certPath,
      };
      await browser.connectWithConnectionForm({
        ...atlasConnectionOptions,
        connectionName,
      });
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    } finally {
      if (tempdir) {
        await fs.rmdir(tempdir, { recursive: true });
      }
    }
  });

  it('can connect to an Atlas cluster with AWS IAM authentication (without session token)', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const connectionName = this.test?.fullTitle() ?? '';

    const atlasConnectionOptions: ConnectFormState = {
      hosts: [process.env.E2E_TESTS_FREE_TIER_HOST ?? ''],
      authMethod: 'MONGODB-AWS',
      scheme: 'MONGODB_SRV',
      awsAccessKeyId: process.env.E2E_TESTS_ATLAS_IAM_ACCESS_KEY_ID ?? '',
      awsSecretAccessKey:
        process.env.E2E_TESTS_ATLAS_IAM_SECRET_ACCESS_KEY ?? '',
    };
    await browser.connectWithConnectionForm({
      ...atlasConnectionOptions,
      connectionName,
    });
    await browser.screenshot('without-session-token-shell.png');
    const result = await browser.shellEval(
      connectionName,
      'db.runCommand({ connectionStatus: 1 })',
      true
    );
    assertNotError(result);
    expect(result).to.have.property('ok', 1);
  });

  it('can connect to an Atlas cluster with AWS IAM authentication (including session token)', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    if (process.env.EVERGREEN && process.platform === 'win32') {
      // TODO: https://jira.mongodb.org/browse/COMPASS-5575
      console.warn("Evergreen doesn't have aws cli installed");
      this.skip();
    }

    console.log('generating session token');
    const { key, secret, token } = generateIamSessionToken();

    const atlasConnectionOptions: ConnectFormState = {
      hosts: [process.env.E2E_TESTS_FREE_TIER_HOST ?? ''],
      authMethod: 'MONGODB-AWS',
      scheme: 'MONGODB_SRV',
      awsAccessKeyId: key,
      awsSecretAccessKey: secret,
      awsSessionToken: token,
    };
    const connectionName = this.test?.fullTitle() ?? '';
    await browser.connectWithConnectionForm({
      ...atlasConnectionOptions,
      connectionName,
    });
    await browser.screenshot('including-session-token-shell.png');
    const result = await browser.shellEval(
      connectionName,
      'db.runCommand({ connectionStatus: 1 })',
      true
    );
    assertNotError(result);
    expect(result).to.have.property('ok', 1);
  });

  it('can connect to an Atlas with tlsUseSystemCA', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const username = process.env.E2E_TESTS_ATLAS_USERNAME ?? '';
    const password = process.env.E2E_TESTS_ATLAS_PASSWORD ?? '';
    const host = process.env.E2E_TESTS_ATLAS_HOST ?? '';
    const connectionName = this.test?.fullTitle() ?? '';

    await browser.connectWithConnectionForm({
      scheme: 'MONGODB_SRV',
      authMethod: 'DEFAULT',
      defaultUsername: username,
      defaultPassword: password,
      hosts: [host],
      sslConnection: 'ON',
      useSystemCA: true,
      connectionName,
    });

    await browser.screenshot('tlsUseSystemCA-shell.png');

    // NB: The fact that we can use the shell is a regression test for COMPASS-5802.
    const result = await browser.shellEval(
      connectionName,
      'db.runCommand({ connectionStatus: 1 })',
      true
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
    assertNotError(result);
    expect(result).to.have.property('ok', 1);
  });

  it('can connect to Atlas Serverless', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const atlasConnectionOptions: ConnectFormState = basicAtlasOptions(
      process.env.E2E_TESTS_SERVERLESS_HOST ?? ''
    );
    const connectionName = this.test?.fullTitle() ?? '';
    await browser.connectWithConnectionForm({
      ...atlasConnectionOptions,
      connectionName,
    });
    const result = await browser.shellEval(
      connectionName,
      'db.runCommand({ connectionStatus: 1 })',
      true
    );
    assertNotError(result);
    expect(result).to.have.property('ok', 1);
  });

  it('can connect to Atlas Datalake', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const atlasConnectionOptions: ConnectFormState = basicAtlasOptions(
      process.env.E2E_TESTS_DATA_LAKE_HOST ?? ''
    );
    atlasConnectionOptions.scheme = 'MONGODB';
    atlasConnectionOptions.defaultDatabase = 'test';
    atlasConnectionOptions.sslConnection = 'ON';
    atlasConnectionOptions.defaultAuthSource = 'admin';
    const connectionName = this.test?.fullTitle() ?? '';

    await browser.connectWithConnectionForm({
      ...atlasConnectionOptions,
      connectionName,
    });
    const result = await browser.shellEval(
      connectionName,
      'db.runCommand({ connectionStatus: 1 })',
      true
    );
    assertNotError(result);
    expect(result).to.have.property('ok', 1);
  });

  it('can connect to Atlas Analytics Node', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const atlasConnectionOptions: ConnectFormState = basicAtlasOptions(
      process.env.E2E_TESTS_ANALYTICS_NODE_HOST ?? ''
    );
    const connectionName = this.test?.fullTitle() ?? '';
    await browser.connectWithConnectionForm({
      ...atlasConnectionOptions,
      connectionName,
    });
    const result = await browser.shellEval(
      connectionName,
      'db.runCommand({ connectionStatus: 1 })',
      true
    );
    assertNotError(result);
    expect(result).to.have.property('ok', 1);
  });

  it('can connect to Atlas Free Tier', async function () {
    if (!hasAtlasEnvironmentVariables()) {
      return this.skip();
    }

    const atlasConnectionOptions: ConnectFormState = basicAtlasOptions(
      process.env.E2E_TESTS_FREE_TIER_HOST ?? ''
    );
    const connectionName = this.test?.fullTitle() ?? '';
    await browser.connectWithConnectionForm({
      ...atlasConnectionOptions,
      connectionName,
    });
    const result = await browser.shellEval(
      connectionName,
      'db.runCommand({ connectionStatus: 1 })',
      true
    );
    assertNotError(result);
    expect(result).to.have.property('ok', 1);
  });
});

// eslint-disable-next-line mocha/max-top-level-suites
describe('SRV connectivity', function () {
  before(function () {
    skipForWeb(
      this,
      'compass-web does not do SRV resolution in the client via OS DNS APIs'
    );
  });

  it('resolves SRV connection string using OS DNS APIs', async function () {
    if (TEST_MULTIPLE_CONNECTIONS) {
      // TODO(COMPAS-8009): we have to add support in custom commands for when connections fail
      this.skip();
    }

    const compass = await init(this.test?.fullTitle());
    const browser = compass.browser;

    try {
      // Does not actually succeed at connecting, but that’s fine for us here
      // (Unless you have a server listening on port 27017)
      await browser.connectWithConnectionString(
        'mongodb+srv://test1.test.build.10gen.cc/test?tls=false',
        'either'
      );
    } finally {
      // make sure the browser gets closed otherwise if this fails the process wont exit
      await cleanup(compass);
    }

    const { logs } = compass;

    // Find information about which DNS resolutions happened and how:
    const resolutionLogs = logs
      .filter(
        (log) => log.id === 1_000_000_039 && log.ctx === 'compass-connect'
      )
      .map((log) => log.attr);

    expect(resolutionLogs).to.have.lengthOf(1);

    const { from, to, resolutionDetails } = resolutionLogs[0];
    const fromCS = new ConnectionString(from);
    const toCS = new ConnectionString(to);
    fromCS.searchParams.delete('appname');
    toCS.searchParams.delete('appname');
    toCS.hosts.sort();
    expect(fromCS.href).to.equal(
      'mongodb+srv://test1.test.build.10gen.cc/test?tls=false'
    );
    expect(toCS.href).to.equal(
      'mongodb://localhost.test.build.10gen.cc,localhost.test.build.10gen.cc:27018/test?tls=false'
    );

    expect(resolutionDetails).to.have.lengthOf(2);
    const srvResolution = resolutionDetails.find((q: any) => q.query === 'SRV');
    const txtResolution = resolutionDetails.find((q: any) => q.query === 'TXT');
    expect(srvResolution).to.deep.equal({
      query: 'SRV',
      hostname: '_mongodb._tcp.test1.test.build.10gen.cc',
      error: null,
      wasNativelyLookedUp: true,
    });
    txtResolution.error = !!txtResolution.error; // Do not assert exact error message
    expect(txtResolution).to.deep.equal({
      query: 'TXT',
      hostname: 'test1.test.build.10gen.cc',
      error: true,
      wasNativelyLookedUp: false, // Due to fallback to Node.js API after resolution error
    });
  });
});

// eslint-disable-next-line mocha/max-top-level-suites
describe('System CA access', function () {
  before(function () {
    skipForWeb(this, 'system CA not applicable to compass-web');
  });

  it('allows using the system certificate store for connections', async function () {
    const compass = await init(this.test?.fullTitle());
    const browser = compass.browser;

    const connectionName = this.test?.fullTitle() ?? '';

    try {
      await browser.connectWithConnectionForm({
        hosts: ['127.0.0.1:27091'],
        sslConnection: 'DEFAULT',
        useSystemCA: true,
        connectionName,
      });
      const result = await browser.shellEval(
        connectionName,
        'db.runCommand({ connectionStatus: 1 })',
        true
      );
      assertNotError(result);
      expect(result).to.have.property('ok', 1);
    } finally {
      // make sure the browser gets closed otherwise if this fails the process won't exit
      await cleanup(compass);
    }

    const { logs } = compass;
    const systemCALogs = logs.filter((log) => log.id === 1_000_000_049);
    expect(systemCALogs).to.have.lengthOf(2);
    expect(new Set(systemCALogs.map((log) => log.ctx))).to.deep.equal(
      new Set(['compass-connect', 'mongosh-connect'])
    );
    for (let i = 0; i < 2; i++) {
      expect(systemCALogs[i].attr.caCount).to.be.a('number');
      expect(systemCALogs[i].attr.caCount).to.be.greaterThan(1);
      if (
        process.platform !== 'linux' &&
        systemCALogs[i].attr.asyncFallbackError
      ) {
        // Electron does not support Node.js worker threads at this point, so
        // we allow this failure. This will hopefully just go away with an Electron
        // upgrade in the future.
        expect(systemCALogs[i].attr.asyncFallbackError).to.equal(
          'The V8 platform used by this instance of Node does not support creating Workers'
        );
      } else {
        expect(systemCALogs[i].attr.asyncFallbackError).to.equal(null);
      }
    }
  });
});

describe('FLE2', function () {
  let compass: Compass;
  let browser: CompassBrowser;

  before(async function () {
    skipForWeb(this, 'client-side encryption not available in compass-web');

    compass = await init(this.test?.fullTitle());
    browser = compass.browser;
  });

  afterEach(async function () {
    await screenshotIfFailed(compass, this.currentTest);
  });

  after(async function () {
    if (TEST_COMPASS_WEB) {
      return;
    }

    await cleanup(compass);
  });

  it('can connect using local KMS', async function () {
    if (!serverSatisfies('>= 6.0.0', true)) {
      return this.skip();
    }

    const connectionName = this.test?.fullTitle() ?? '';

    await browser.connectWithConnectionForm({
      hosts: ['127.0.0.1:27091'],
      fleKeyVaultNamespace: 'alena.keyvault',
      fleKey: 'A'.repeat(128),
      fleEncryptedFieldsMap: `{
        'alena.coll': {
          fields: [
            {
              path: 'phoneNumber',
              keyId: 'UUID("fd6275d7-9260-4e6c-a86b-68ec5240814a")',
              bsonType: 'string'
            }
          ]
        }
      }`,
      connectionName,
    });
    const result = await browser.shellEval(
      connectionName,
      'db.getName()',
      true
    );
    expect(result).to.be.equal('test');
  });
});

function assertNotError(result: any) {
  if (typeof result === 'string' && result.includes('MongoNetworkError')) {
    expect.fail(result);
  }
}
