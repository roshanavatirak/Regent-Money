import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config();

const dbUrl = process.env.DATABASE_URL;
const supabaseCa = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n');
const isSupabase = dbUrl?.includes('supabase') || !!supabaseCa;

const sslConfig = isSupabase
  ? supabaseCa
    ? { ca: supabaseCa, rejectUnauthorized: true }
    : { rejectUnauthorized: false }
  : false;

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: dbUrl,
  ssl: sslConfig,
  extra: {
    // Prevent migrations from stalling production with lock queues
    options: '-c lock_timeout=5000ms',
  },
  entities: [
    path.join(__dirname, '**/*.entity{.ts,.js}'),
  ],
  migrations: [
    path.join(__dirname, 'migrations/*{.ts,.js}'),
  ],
  synchronize: false,
});
