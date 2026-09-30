const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Allow both Mapbox databases and font files
// config.resolver.assetExts.push('mbtiles', 'pbf');
config.resolver.assetExts.push('mbtiles', 'pbf', 'graph');

module.exports = config;