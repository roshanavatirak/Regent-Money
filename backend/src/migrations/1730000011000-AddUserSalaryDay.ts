import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The day a user's salary usually comes, for salary-to-salary budgets and payday alerts.
 * 1–31 (31 = month end), 0 = not fixed, NULL = not set. AuthService also adds it on startup
 * (IF NOT EXISTS); this records it.
 */
export class AddUserSalaryDay1730000011000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE core.users ADD COLUMN IF NOT EXISTS salary_day SMALLINT`);
    // Weekly / every 2 weeks / irregular pay, or a second monthly salary (JSON, see users/pay-schedule.ts).
    await q.query(`ALTER TABLE core.users ADD COLUMN IF NOT EXISTS pay_schedule TEXT`);
    // Yearly costs and "Salary received" marks (JSON, see users/money-cycle-data.ts).
    await q.query(`ALTER TABLE core.users ADD COLUMN IF NOT EXISTS money_cycle_data TEXT`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE core.users DROP COLUMN IF EXISTS money_cycle_data`);
    await q.query(`ALTER TABLE core.users DROP COLUMN IF EXISTS pay_schedule`);
    await q.query(`ALTER TABLE core.users DROP COLUMN IF EXISTS salary_day`);
  }
}
