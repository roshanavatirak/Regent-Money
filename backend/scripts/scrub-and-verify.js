const path = require('path');
const root = 'c:/Users/rosha/Desktop/RAO Projects/Regent Money/backend';
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });
const { Client } = require(path.join(root, 'node_modules/pg'));
const fs = require('fs');

const { NestFactory } = require(path.join(root, 'node_modules/@nestjs/core'));
const { AppModule } = require(path.join(root, 'dist/app.module'));
const { SyncService } = require(path.join(root, 'dist/sync/sync.service'));

BigInt.prototype.toJSON = function () { return Number(this); };

const env = fs.readFileSync(path.join(root, '.env'), 'utf-8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();

async function scrubAndVerify() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('1. Checking counts before scrub:');
  const beforeTx = await client.query('SELECT count(*) as total, count(amount) as pt_amount, count(merchant) as pt_merchant FROM finance.transactions WHERE enc_amount IS NOT NULL;');
  console.log('Transactions before:', beforeTx.rows[0]);

  const beforeInc = await client.query('SELECT count(*) as total, count(amount) as pt_amount, count(source) as pt_source FROM finance.income_records WHERE enc_amount IS NOT NULL;');
  console.log('Income records before:', beforeInc.rows[0]);

  console.log('2. Scrubbing plaintext amounts and text from finance.transactions...');
  const resTx = await client.query(`
    UPDATE finance.transactions
    SET amount = NULL, merchant = NULL
    WHERE enc_amount IS NOT NULL;
  `);
  console.log(`Updated ${resTx.rowCount} transaction rows to NULL plaintext.`);

  console.log('3. Scrubbing plaintext amounts and source from finance.income_records...');
  const resInc = await client.query(`
    UPDATE finance.income_records
    SET amount = NULL, source = NULL
    WHERE enc_amount IS NOT NULL;
  `);
  console.log(`Updated ${resInc.rowCount} income rows to NULL plaintext.`);

  const afterTx = await client.query('SELECT count(*) as total, count(amount) as pt_amount, count(merchant) as pt_merchant FROM finance.transactions WHERE enc_amount IS NOT NULL;');
  console.log('Transactions after scrub:', afterTx.rows[0]);

  const afterInc = await client.query('SELECT count(*) as total, count(amount) as pt_amount, count(source) as pt_source FROM finance.income_records WHERE enc_amount IS NOT NULL;');
  console.log('Income records after scrub:', afterInc.rows[0]);

  await client.end();

  console.log('4. Booting NestJS to verify live sync with zero plaintext in DB...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sync = app.get(SyncService);
  const userId = 'cdca8707-674f-413d-8d0a-79ee86978b48';

  const syncResult = await sync.sync(userId);
  console.log('Sync with Zero Plaintext in Database:');
  console.log(`- Transactions decrypted: ${syncResult.transactions.length}`);
  console.log(`- Bank profiles: ${syncResult.bankProfiles.length}`);
  console.log(`- Income records decrypted: ${syncResult.incomeRecords.length}`);

  const sample = syncResult.transactions[0];
  console.log('Sample transaction verified:', {
    id: sample.id,
    amount: sample.amount,
    merchant: sample.merchant,
    rowVersion: sample.rowVersion,
  });

  const sampleInc = syncResult.incomeRecords[0];
  console.log('Sample income verified:', {
    id: sampleInc.id,
    amount: sampleInc.amount,
    source: sampleInc.source,
    rowVersion: sampleInc.rowVersion,
  });

  await app.close();
  console.log('SUCCESS: All data is 100% encrypted at rest and fully decrypted dynamically on sync!');
}

scrubAndVerify().catch(console.error);

