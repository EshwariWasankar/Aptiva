// apps/api/src/app.module.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule', () => {
  let module: TestingModule;
  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });
  it('should be defined', () => {
    const app = module.get<AppModule>(AppModule);
    expect(app).toBeDefined();
  });
});
