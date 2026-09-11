type Listener = () => void;

const listeners = new Set<Listener>();

export function openCommandPalette(): void {
  listeners.forEach(listener => listener());
}

export function subscribeCommandPalette(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}