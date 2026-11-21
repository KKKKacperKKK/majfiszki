// Netlify Server: backend API aplikacji (Express). Frontend to statyczne pliki z katalogu dist/.
import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';

const { app } = await createApp(loadConfig());

export default app;

// Serwer obsługuje wyłącznie API; resztę adresów serwuje CDN Netlify.
export const config = {
  path: '/api/*',
};
