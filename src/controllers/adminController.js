const asyncHandler = require('express-async-handler');

const Countries = require('../models/countriesModel');
const ListingSearchCity = require('../models/listingSearchCityModel');
const Amenities = require('../models/amenitiesModel');
const PropertyType = require('../models/propertyTypeModel');
const ListingType = require('../models/listingTypeModel');
const JobTitles = require('../models/jobTitlesModel');
const { AGENT_TYPE_OPTIONS, AGENT_EXPERIENCE_OPTIONS } = require('../utils/constants');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

/**
 * @swagger
 * /master-data:
 *   get:
 *     summary: Get admin master data lists
 *     description: |
 *       Returns one or more master-data collections used by the admin UI.
 *
 *       Request a single type via `type`, or multiple via `types` (comma-separated).
 *       The response `data` object includes only the keys you requested.
 *
 *       **Supported values:**
 *       - countries — active countries (displayOrder, name)
 *       - amenities — active amenities
 *       - propertytypes — active property types (response key `propertyTypes`)
 *       - listingtypes — active listing types (response key `listingTypes`)
 *       - agenttypes — agent / superagent dropdown options (response key `agentTypes`, `{ name, value }`)
 *       - jobtitles — active job titles for agent specialization (response key `jobTitles`)
 *       - agentexperience — years of experience dropdown options (response key `agentExperience`, `{ name, value }`)
 *       - supportedurls — CloudFront base URLs for img/vid/doc per entity (response key `supportedUrls`: projectUrl, propertyUrl, agentUrl, agencyUrl, developerUrl, userUrl, amenityUrl, awardUrl)
 *       - propertylocations — cities with property listings (response key `propertyLocations`, from ListingSearchCity)
 *
 *       **Examples:**
 *       - `GET /admin/master-data?type=countries`
 *       - `GET /admin/master-data?types=agenttypes,jobtitles,agentexperience`
 *       - `GET /admin/master-data?types=countries,supportedurls`
 *     tags: [Admin - Master Data]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         required: false
 *         description: Single master-data type to fetch.
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         required: false
 *         description: Comma-separated list of master-data types to fetch.
 *     responses:
 *       200:
 *         description: Master data fetched successfully.
 *       400:
 *         description: Validation error (missing or invalid type(s)).
 *       500:
 *         description: Server error while fetching master data.
 */
const getMasterData = asyncHandler(async (req, res) => {
  try {
    const { type, types } = req.query || {};

    let requestedTypes = [];

    if (types) {
      requestedTypes = String(types)
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    } else if (type) {
      requestedTypes = [String(type).trim().toLowerCase()];
    }

    if (!requestedTypes.length) {
      return failure(res, 400, 'Query parameter "type" or "types" is required', 'VALIDATION_ERROR');
    }

    const supportedTypes = [
      'countries',
      'amenities',
      'propertytypes',
      'listingtypes',
      'supportedurls',
      'agenttypes',
      'jobtitles',
      'agentexperience',
      'propertylocations',
    ];
    const invalidTypes = requestedTypes.filter((t) => !supportedTypes.includes(t));

    if (invalidTypes.length) {
      return failure(
        res,
        400,
        `Invalid master data type(s): ${invalidTypes.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    const data = {};

    if (requestedTypes.includes('countries')) {
      const countries = await Countries.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
      data.countries = countries;
    }

    if (requestedTypes.includes('amenities')) {
      const amenities = await Amenities.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
      data.amenities = amenities;
    }

    if (requestedTypes.includes('propertytypes')) {
      const propertyTypes = await PropertyType.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
      data.propertyTypes = propertyTypes;
    }

    if (requestedTypes.includes('listingtypes')) {
      const listingTypes = await ListingType.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
      data.listingTypes = listingTypes;
    }

    if (requestedTypes.includes('agenttypes')) {
      data.agentTypes = AGENT_TYPE_OPTIONS;
    }

    if (requestedTypes.includes('jobtitles')) {
      const jobTitles = await JobTitles.find({ isActive: true })
        .sort({ title: 1 })
        .lean();
      data.jobTitles = jobTitles;
    }

    if (requestedTypes.includes('agentexperience')) {
      data.agentExperience = AGENT_EXPERIENCE_OPTIONS;
    }

    if (requestedTypes.includes('propertylocations')) {
      data.propertyLocations = await ListingSearchCity.find({ propertyCount: { $gt: 0 } })
        .select('cityKey displayName propertyCount updatedAt')
        .sort({ displayName: 1 })
        .lean();
    }

    if (requestedTypes.includes('supportedurls')) {
      data.supportedUrls = {
        projectUrl:{
          "img":"https://d1dp1oh0ra5b0z.cloudfront.net/img/project/",
          "vid":"https://d1dp1oh0ra5b0z.cloudfront.net/vid/project/",
          "doc":"https://d1dp1oh0ra5b0z.cloudfront.net/doc/project/"
        },
        propertyUrl:{
          "img":"https://d1dp1oh0ra5b0z.cloudfront.net/img/property/",
          "vid":"https://d1dp1oh0ra5b0z.cloudfront.net/vid/property/",
          "doc":"https://d1dp1oh0ra5b0z.cloudfront.net/doc/property/"
        },
        agentUrl:{
          "img":"https://d1dp1oh0ra5b0z.cloudfront.net/img/agents/",
          "vid":"https://d1dp1oh0ra5b0z.cloudfront.net/vid/agents/",
          "doc":"https://d1dp1oh0ra5b0z.cloudfront.net/doc/agents/"
        },
        agencyUrl:{
          "img":"https://d1dp1oh0ra5b0z.cloudfront.net/img/agency/",
          "vid":"https://d1dp1oh0ra5b0z.cloudfront.net/vid/agency/",
          "doc":"https://d1dp1oh0ra5b0z.cloudfront.net/doc/agency/"
        },
        developerUrl:{
          "img":"https://d1dp1oh0ra5b0z.cloudfront.net/img/developer/",
          "vid":"https://d1dp1oh0ra5b0z.cloudfront.net/vid/developer/",
          "doc":"https://d1dp1oh0ra5b0z.cloudfront.net/doc/developer/"
        },
        userUrl:{
          "img":"https://d1dp1oh0ra5b0z.cloudfront.net/img/user/",
          "vid":"https://d1dp1oh0ra5b0z.cloudfront.net/vid/user/",
          "doc":"https://d1dp1oh0ra5b0z.cloudfront.net/doc/user/"
        },
        amenityUrl:{
          "img":"https://d1dp1oh0ra5b0z.cloudfront.net/img/amenities/",
          "vid":"",
          "doc":""
        },
        awardUrl:{
          "img":"https://d1dp1oh0ra5b0z.cloudfront.net/img/award/",
          "vid":"",
          "doc":""
        }
      }
    }

    return success(res, 'Master data fetched successfully', data);
  } catch (error) {
    logger.error('Get master data failed', { error: error.message });
    return failure(res, 500, 'Failed to fetch master data', 'SERVER_ERROR');
  }
});

module.exports = {
  getMasterData,
};

