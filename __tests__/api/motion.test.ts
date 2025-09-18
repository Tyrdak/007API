import { createMocks } from 'node-mocks-http';

describe('POST /api/motion', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.MOTIONS_TABLE = 'motions';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('refuse les méthodes non-POST avec 405', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    const handler = (await import('../../pages/api/motion')).default;
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('retourne 500 quand les variables Supabase manquent', async () => {
    delete process.env.SUPABASE_URL;
    const { req, res } = createMocks({ method: 'POST', body: {} });
    const handler = (await import('../../pages/api/motion')).default;
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.ok).toBe(false);
  });

  it('insère la charge utile et répond ok: true', async () => {
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({
          insert: async () => ({ error: null }),
        }),
        auth: { persistSession: false },
      }),
    }));

    const mockedHandler = (await import('../../pages/api/motion')).default;

    const { req, res } = createMocks({
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4' },
      body: { Msg: 'Hello', lat: '10.5', lon: '20.25', Host: 'pi', Url: 'http://camera.local/frame.jpg' },
    });

    await mockedHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.ok).toBe(true);
    expect(data.received.message).toBe('Hello');
    expect(data.received.latitude).toBe(10.5);
    expect(data.received.longitude).toBe(20.25);
    expect(data.received.host).toBe('pi');
    expect(data.received.url).toBe('http://camera.local/frame.jpg');
  });

  it("refuse si INGEST_SECRET est défini et la clé ne correspond pas (hors prod)", async () => {
    process.env.INGEST_SECRET = 'secret';
    const { req, res } = createMocks({ method: 'POST', body: { key: 'bad' } });
    const handler = (await import('../../pages/api/motion')).default;
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });
});


