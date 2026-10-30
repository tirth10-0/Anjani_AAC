import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'html-cache-buster',
      transformIndexHtml(html) {
        const timestamp = Date.now();
        return html
          .replace(/(\.(?:css|js))\?v=\d+/g, `$1?v=${timestamp}`)
          .replace(
            '<head>',
            `<head>
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">`
          );
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        dashboard: resolve(__dirname, 'pages/dashboard.html'),
        products: resolve(__dirname, 'pages/products.html'),
        inventory: resolve(__dirname, 'pages/inventory.html'),
        clients: resolve(__dirname, 'pages/clients.html'),
        suppliers: resolve(__dirname, 'pages/suppliers.html'),
        purchases: resolve(__dirname, 'pages/purchases.html'),
        orders: resolve(__dirname, 'pages/orders.html'),
        transactions: resolve(__dirname, 'pages/transactions.html'),
        expenses: resolve(__dirname, 'pages/expenses.html'),
        reports: resolve(__dirname, 'pages/reports.html'),
        formulations: resolve(__dirname, 'pages/formulations.html'),
        production: resolve(__dirname, 'pages/production.html'),
        daily_transactions: resolve(__dirname, 'pages/daily-transactions.html'),
        calculator: resolve(__dirname, 'pages/calculator.html'),
        batch_calculator: resolve(__dirname, 'pages/batch-calculator.html'),
        exports: resolve(__dirname, 'pages/exports.html'),
        profile: resolve(__dirname, 'pages/profile.html'),
        companies: resolve(__dirname, 'pages/companies.html'),
        warehouses: resolve(__dirname, 'pages/warehouses.html')
      }
    }
  }
});
