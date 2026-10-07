import { importedSavedUrls } from '../shared/saved-urls';

test('importa formatos atual e legado sem perder pasta e apelido', () => {
  expect(
    importedSavedUrls([
      { folder: 'Cliente', name: 'Produção', url: 'https://example.com/mge/' },
    ]),
  ).toEqual([
    { folder: 'Cliente', name: 'Produção', url: 'https://example.com/mge/' },
  ]);
  expect(importedSavedUrls(['http://localhost:8080/mge/'])).toEqual([
    {
      folder: 'Sem pasta',
      name: 'http://localhost:8080/mge/',
      url: 'http://localhost:8080/mge/',
    },
  ]);
  expect(() =>
    importedSavedUrls([{ folder: 'Cliente', name: 'Base', url: 'file:///x' }]),
  ).toThrow('Base com URL inválida.');
});
