import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health Endpoint (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('timestamp');
      });
  });

  it('/api/v1/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/ready')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status', 'ready');
        expect(res.body).toHaveProperty('timestamp');
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
