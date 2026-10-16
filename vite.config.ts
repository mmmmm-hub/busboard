import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base を './' にしているので、GitHub Pages のサブパス(https://user.github.io/repo/)でも
// 独自ドメインでも、そのまま動く。ルーティングはHashRouterなのでサーバー設定も不要。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: { sourcemap: false },
});
