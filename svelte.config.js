import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html', // Enable SPA mode for GitHub Pages
      precompress: false,
      strict: false // Allow missing routes
    }),
    paths: {
      base: process.env.NODE_ENV === 'production' ? '/mocap-svelte' : ''
    }
  }
};