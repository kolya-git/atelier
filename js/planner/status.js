// Status eines Beitrags / einer Story.
export const STATUS = {
  idee: { label: 'Idee' },
  entwurf: { label: 'Entwurf' },
  bereit: { label: 'Bereit' },
  veroeffentlicht: { label: 'Veröffentlicht' },
};
export const STATUS_OPTIONS = Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label }));
