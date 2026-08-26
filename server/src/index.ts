import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { errorHandler, notFound } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { flangesRouter } from './routes/flanges.js';
import { fabricsRouter } from './routes/fabrics.js';
import { chemicalsRouter } from './routes/chemicals.js';
import { recipesRouter } from './routes/recipes.js';
import { workflowsRouter } from './routes/workflows.js';
import { machinesRouter } from './routes/machines.js';
import { ordersRouter } from './routes/orders.js';
import { auditRouter } from './routes/audit.js';
import { planningRouter } from './routes/planning.js';
import { stockRouter } from './routes/stock.js';

const app = express();

// Denetim kayitlarindaki IP'nin vekil sunucunun degil gercek istemcinin
// olmasi icin gerekli.
app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

app.use(
  helmet({
    // API JSON doner, tarayicida sayfa render etmez; CSP'yi web istemcisi
    // kendi index.html'inde tanimlar.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    // API hicbir zaman cerceve icine alinmamali.
    frameguard: { action: 'deny' },
    hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  }),
);

app.use(
  cors({
    origin: env.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

const limitAsimiYaniti = { error: 'Cok fazla istek gonderildi. Lutfen biraz sonra tekrar deneyin.' };

/** Genel API kotasi: otomatik tarama ve kotu niyetli yuklere karsi tavan. */
const genelLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: limitAsimiYaniti,
});

/**
 * Giris denemeleri icin siki kota. Hesap bazli kilit routes/auth.ts icinde;
 * bu katman ayni IP'den farkli kullanici adlarinin denenmesini sinirlar.
 */
const girisLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Cok fazla giris denemesi yapildi. 15 dakika sonra tekrar deneyin.' },
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'marpol-ppm-api', time: new Date().toISOString() });
});

app.use('/api', genelLimit);
app.use('/api/auth/login', girisLimit);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/flanges', flangesRouter);
app.use('/api/fabrics', fabricsRouter);
app.use('/api/chemicals', chemicalsRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/machines', machinesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/audit', auditRouter);
app.use('/api/planning', planningRouter);
app.use('/api/stock', stockRouter);

app.use((_req, _res, next) => next(notFound('Istenen servis bulunamadi.')));
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`[MARPOL PPM] API calisiyor -> http://localhost:${env.port}`);
});
