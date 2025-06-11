import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html', // Add fallback for SPA
      precompress: false,
      strict: false // Allow missing routes
    }),
    paths: {
      base: process.env.NODE_ENV === 'production' ? '/your-repo-name' : ''
    }
  }
};