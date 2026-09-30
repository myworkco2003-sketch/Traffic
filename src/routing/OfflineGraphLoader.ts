import { Asset } from 'expo-asset';

export async function loadOfflineGraph() {
  const asset = Asset.fromModule(
    require('../../assets/routing/offline_graph.graph')
  );

  await asset.downloadAsync();

  const uri = asset.localUri ?? asset.uri;

  if (!uri) {
    throw new Error('Offline graph asset URI is missing');
  }

  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(
      `Failed to read offline graph: ${response.status}`
    );
  }

  const graph = await response.json();

  return graph;
}