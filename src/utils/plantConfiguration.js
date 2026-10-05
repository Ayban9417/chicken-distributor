export function configuredProductById(products, plantProductId) {
  return (products || []).find((item) => item.id === plantProductId) || null;
}

export function withoutConfiguredProduct(products, plantProductId) {
  return (products || []).filter((item) => item.id !== plantProductId);
}
