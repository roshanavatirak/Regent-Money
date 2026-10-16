import * as readline from 'readline';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function getPassword(): Promise<string> {
  if (process.env.ADMIN_INITIAL_PASSWORD) {
    return process.env.ADMIN_INITIAL_PASSWORD;
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    process.stdout.write('Enter secure password for atlas@regentmoney.com (min 16 chars): ');

    let entered = '';
    const onData = (chunk: Buffer | string) => {
      const str = chunk.toString();
      for (const char of str) {
        if (char === '\r' || char === '\n') {
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(entered);
          return;
        } else if (char === '\u0008' || char === '\x7f') {
          // Backspace
          if (entered.length > 0) {
            entered = entered.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (char.charCodeAt(0) >= 32) {
          entered += char;
          process.stdout.write('*');
        }
      }
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.on('data', onData);
  });
}

async function run() {
  const plainPassword = await getPassword();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  if (!plainPassword || plainPassword.length < 8) {
    console.error('\nSecurity Violation: Password must be at least 8 characters.');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL environment variable is missing.');
    process.exit(1);
  }

  const supabaseCa = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n');
  const isSupabase = dbUrl.includes('supabase') || !!supabaseCa;

  const dataSource = new DataSource({
    type: 'postgres',
    url: dbUrl,
    ssl: isSupabase
      ? supabaseCa
        ? { ca: supabaseCa, rejectUnauthorized: true }
        : { rejectUnauthorized: false }
      : false,
  });

  await dataSource.initialize();
  console.log('Connected to database successfully.');

  const targetEmail = 'atlas@regentmoney.com';

  // 1. Strict Abort on Conflict: Never promote or overwrite an existing account
  const existing = await dataSource.query(
    `SELECT id, email, role FROM core.users WHERE LOWER(email) = LOWER($1)`,
    [targetEmail],
  );

  if (existing.length > 0) {
    console.error(
      `\n[SECURITY ERROR] An account with email "${targetEmail}" already exists (ID: ${existing[0].id}).`,
    );
    console.error(
      'Aborting seed script. Please inspect this account manually before granting administrative privileges.',
    );
    await dataSource.destroy();
    process.exit(1);
  }

  // 2. Compute and verify real bcrypt hash
  const hash = await bcrypt.hash(plainPassword, 10);
  const isValid = await bcrypt.compare(plainPassword, hash);
  if (!isValid) {
    throw new Error('Bcrypt verification check failed.');
  }

  // 3. Generate SINGLE canonical UUID for both id and user_id
  const adminId = crypto.randomUUID();
  const now = Date.now();

  await dataSource.query(
    `
    INSERT INTO core.users (
      id, user_id, email, name, phone, password_hash, role, 
      is_verified, is_banned, is_deleted, auth_provider, created_at, updated_at
    ) VALUES (
      $1, $1, $2, 'Atlas Admin', NULL, $3, 'admin',
      TRUE, FALSE, FALSE, 'email', $4, $4
    )
  `,
    [adminId, targetEmail, hash, now],
  );

  console.log(`\nSuccessfully provisioned Admin: ${targetEmail}`);
  console.log(`Canonical UUID: ${adminId}`);
  await dataSource.destroy();
}

run().catch((err) => {
  console.error('\nSeed script failed:', err?.message || err);
  process.exit(1);
});
