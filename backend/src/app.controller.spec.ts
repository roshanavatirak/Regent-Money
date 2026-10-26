import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Regent Money Backend API"', () => {
      expect(appController.getHello()).toBe('Regent Money Backend API');
    });
  });

  describe('version check backward compatibility', () => {
    it('should return string release notes for older clients (< 1.0.47) to avoid React child crash', async () => {
      process.env.LATEST_APP_VERSION = '1.0.47';
      const result = await appController.checkAppVersion('android', '1.0.46');
      expect(result.isUpdateAvailable).toBe(true);
      expect(result.releaseNotes.length).toBeGreaterThan(0);
      result.releaseNotes.forEach((note) => {
        expect(typeof note).toBe('string');
      });
    });

    it('should return object release notes for newer clients (>= 1.0.47)', async () => {
      process.env.LATEST_APP_VERSION = '1.0.48';
      const result = await appController.checkAppVersion('android', '1.0.47');
      expect(result.isUpdateAvailable).toBe(true);
      expect(result.releaseNotes.length).toBeGreaterThan(0);
      result.releaseNotes.forEach((note) => {
        expect(typeof note).toBe('object');
        expect(typeof (note as any).title).toBe('string');
      });
    });
  });
});
