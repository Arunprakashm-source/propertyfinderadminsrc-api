const asyncHandler = require('express-async-handler');

const Countries = require('../models/countriesModel');
const Amenities = require('../models/amenitiesModel');
const PropertyType = require('../models/propertyTypeModel');
const ListingType = require('../models/listingTypeModel');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

/**
 * @swagger
 * /master-data:
 *   get:
 *     summary: Get admin master data
 *     tags: [Admin - Master Data]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum:
 *             - countries
 *             - amenities
 *             - propertytypes
 *             - listingtypes
 *             - supportedurls
 *         description: Single master-data type to fetch
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *           example: countries,amenities,supportedurls
 *         description: Comma-separated list of supported types (countries, amenities, propertytypes, listingtypes, supportedurls)
 *     responses:
 *       200:
 *         description: Master data fetched successfully
 *       400:
 *         description: Missing or invalid type(s)
 *       500:
 *         description: Server error
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

    const supportedTypes = ['countries', 'amenities', 'propertytypes', 'listingtypes','supportedurls'];
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

