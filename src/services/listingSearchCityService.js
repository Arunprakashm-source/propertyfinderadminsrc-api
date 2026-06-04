const ListingSearchCity = require('../models/listingSearchCityModel');

function normalizeCityKey(city) {
  if (city == null || typeof city !== 'string') return null;
  const t = city.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  return t.toLowerCase();
}

function toDisplayName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ')
    .trim();
}

/** Cities visible on the property locations admin screen. */
const propertyLocationScope = {
  $or: [{ propertyCount: { $gt: 0 } }, { propertyCount: 0, projectCount: 0 }],
};

/** Cities visible on the project locations admin screen. */
const projectLocationScope = {
  $or: [{ projectCount: { $gt: 0 } }, { propertyCount: 0, projectCount: 0 }],
};

const buildListFilter = ({ kind, countField, search, linkedOnly }) => {
  const scope = kind === 'property' ? propertyLocationScope : projectLocationScope;
  const clauses = [scope];
  if (search && String(search).trim()) {
    const rx = new RegExp(
      String(search)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
    clauses.push({ $or: [{ displayName: rx }, { cityKey: rx }] });
  }
  if (linkedOnly) {
    clauses.push({ [countField]: { $gt: 0 } });
  }
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
};

const countLocationStats = async (kind) => {
  const scope = kind === 'property' ? propertyLocationScope : projectLocationScope;
  const countField = kind === 'property' ? 'propertyCount' : 'projectCount';
  const [totalLocations, withListings] = await Promise.all([
    ListingSearchCity.countDocuments(scope),
    ListingSearchCity.countDocuments({ $and: [scope, { [countField]: { $gt: 0 } }] }),
  ]);
  return { totalLocations, withListings, countField };
};

module.exports = {
  normalizeCityKey,
  toDisplayName,
  propertyLocationScope,
  projectLocationScope,
  buildListFilter,
  countLocationStats,
};
