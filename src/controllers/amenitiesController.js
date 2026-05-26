const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Amenities = require('../models/amenitiesModel');
const Properties = require('../models/propertiesModal');
const { success, failure, generateSlug } = require('../utils/helpers');
const { logger } = require('../utils/logger');

/**
 * @swagger
 * /amenities:
 *   get:
 *     summary: List all amenities with filters and pagination
 *     tags: [Admin - Amenities Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search amenities by name (case-insensitive)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [basic, safety, outdoor, indoor, luxury, other]
 *         description: Filter by category
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Amenities fetched successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
const listAmenities = asyncHandler(async (req, res) => {
  try {
    const {
      search,
      category,
      isActive,
      page = 1,
      limit = 20,
    } = req.query;

    // Parse query parameters
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const filter = {};

    // Search filter (case-insensitive regex on name)
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    // Category filter (exact match)
    if (category) {
      filter.category = category;
    }

    // isActive filter
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true' || isActive === true;
    }

    // Build query
    const query = Amenities.find(filter);

    // Get total count for pagination
    const totalAmenities = await Amenities.countDocuments(filter);

    // Execute query with sorting and pagination
    // Sort by displayOrder ASC, then name ASC
    const amenities = await query
      .sort({ displayOrder: 1, name: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Calculate pagination
    const totalPages = Math.ceil(totalAmenities / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    return success(res, 'Amenities fetched successfully', {
      amenities: amenities.length > 0 ? amenities : [],
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalAmenities,
        limit: limitNum,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    logger.error('List amenities failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch amenities', 'ERROR', error.message);
  }
});

/**
 * @swagger
 * /amenities/create:
 *   post:
 *     summary: Create a new amenity
 *     tags: [Admin - Amenities Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Amenity name (required)
 *                 example: "Swimming Pool"
 *               slug:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 pattern: '^[a-z0-9-]+$'
 *                 description: URL-friendly slug (auto-generated from name if not provided)
 *                 example: "swimming-pool"
 *               category:
 *                 type: string
 *                 enum: [basic, safety, outdoor, indoor, luxury, other]
 *                 default: basic
 *                 description: Amenity category
 *                 example: "outdoor"
 *               icon:
 *                 type: string
 *                 maxLength: 255
 *                 description: Icon URL or identifier
 *                 example: "pool-icon.svg"
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Amenity description
 *                 example: "Outdoor swimming pool facility"
 *     responses:
 *       201:
 *         description: Amenity created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Amenity with this name or slug already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
const createAmenity = asyncHandler(async (req, res) => {
  try {
    const { name, slug, category, icon, description } = req.body;

    // Minimal validation
    if (!name || !name.trim()) {
      return failure(res, 400, 'Name is required');
    }

    // Generate slug from name if not provided
    let finalSlug = slug;
    if (!finalSlug && name) {
      finalSlug = generateSlug(name);
    }

    // Check for duplicate name or slug (case-insensitive for name)
    const existingAmenity = await Amenities.findOne({
      $or: [
        { name: new RegExp(`^${name}$`, 'i') },
        { slug: finalSlug },
      ],
    });

    if (existingAmenity) {
      if (existingAmenity.name.toLowerCase() === name.toLowerCase()) {
        return failure(res, 409, 'Amenity with this name already exists');
      }
      if (existingAmenity.slug === finalSlug) {
        return failure(res, 409, 'Amenity with this slug already exists');
      }
    }

    // Get highest displayOrder and add 1
    const highestOrder = await Amenities.findOne()
      .sort({ displayOrder: -1 })
      .select('displayOrder')
      .lean();
    const displayOrder = highestOrder ? (highestOrder.displayOrder || 0) + 1 : 1;

    // Create new amenity
    const amenityData = {
      name: name.trim(),
      slug: finalSlug,
      category: category || 'basic',
      usageCount: 0,
      isActive: true,
      displayOrder,
    };

    if (icon) amenityData.icon = icon.trim();
    if (description) amenityData.description = description.trim();

    const amenity = new Amenities(amenityData);
    await amenity.save();

    return success(res, 'Amenity created successfully', { amenity }, 201);
  } catch (error) {
    logger.error('Create amenity failed', { error: error.message, stack: error.stack });
    
    // Handle duplicate key error (MongoDB unique index)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return failure(res, 409, `Amenity with this ${field} already exists`);
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return failure(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors);
    }

    return failure(res, 500, 'Failed to create amenity', 'ERROR', error.message);
  }
});

/**
 * @swagger
 * /amenities/{id}:
 *   put:
 *     summary: Update an existing amenity
 *     tags: [Admin - Amenities Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Amenity ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Amenity name
 *                 example: "Swimming Pool"
 *               slug:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 pattern: '^[a-z0-9-]+$'
 *                 description: URL-friendly slug (auto-generated from name if name changed and slug not provided)
 *                 example: "swimming-pool"
 *               category:
 *                 type: string
 *                 enum: [basic, safety, outdoor, indoor, luxury, other]
 *                 description: Amenity category
 *                 example: "outdoor"
 *               icon:
 *                 type: string
 *                 maxLength: 255
 *                 description: Icon URL or identifier
 *                 example: "pool-icon.svg"
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Amenity description
 *                 example: "Outdoor swimming pool facility"
 *               isActive:
 *                 type: boolean
 *                 description: Whether the amenity is active
 *                 example: true
 *               displayOrder:
 *                 type: integer
 *                 minimum: 0
 *                 description: Display order for sorting
 *                 example: 5
 *     responses:
 *       200:
 *         description: Amenity updated successfully
 *       400:
 *         description: Validation error or no fields provided
 *       404:
 *         description: Amenity not found
 *       409:
 *         description: Amenity with this name or slug already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
const updateAmenity = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, category, icon, description, isActive, displayOrder } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid amenity ID format');
    }

    // Find amenity
    const amenity = await Amenities.findById(id);
    if (!amenity) {
      return failure(res, 404, 'Amenity not found');
    }

    // Prepare update object
    const updateData = {};
    let finalSlug = slug;

    // Handle name change - auto-generate slug if name changed and slug not provided
    if (name && name.trim() !== amenity.name) {
      updateData.name = name.trim();
      if (!slug) {
        // Auto-generate slug from new name
        finalSlug = generateSlug(name);
      }
    }

    // Handle slug
    if (finalSlug) {
      updateData.slug = finalSlug.toLowerCase().trim();
    }

    // Handle other fields
    if (category !== undefined) updateData.category = category;
    if (icon !== undefined) updateData.icon = icon ? icon.trim() : icon;
    if (description !== undefined) updateData.description = description ? description.trim() : description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (displayOrder !== undefined) updateData.displayOrder = displayOrder;

    // Check if at least one field is provided for update
    if (Object.keys(updateData).length === 0) {
      return failure(res, 400, 'At least one field must be provided for update');
    }

    // Check for duplicates (exclude current amenity)
    if (updateData.name || updateData.slug) {
      const duplicateFilter = {
        _id: { $ne: id },
        $or: [],
      };

      if (updateData.name) {
        duplicateFilter.$or.push({ name: new RegExp(`^${updateData.name}$`, 'i') });
      }
      if (updateData.slug) {
        duplicateFilter.$or.push({ slug: updateData.slug });
      }

      if (duplicateFilter.$or.length > 0) {
        const existingAmenity = await Amenities.findOne(duplicateFilter);
        if (existingAmenity) {
          if (updateData.name && existingAmenity.name.toLowerCase() === updateData.name.toLowerCase()) {
            return failure(res, 409, 'Amenity with this name already exists');
          }
          if (updateData.slug && existingAmenity.slug === updateData.slug) {
            return failure(res, 409, 'Amenity with this slug already exists');
          }
        }
      }
    }

    // Update updatedAt timestamp
    updateData.updatedAt = new Date();

    // Update amenity
    Object.assign(amenity, updateData);
    await amenity.save();

    return success(res, 'Amenity updated successfully', { amenity });
  } catch (error) {
    logger.error('Update amenity failed', { error: error.message, stack: error.stack });
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return failure(res, 409, `Amenity with this ${field} already exists`);
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return failure(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors);
    }

    return failure(res, 500, 'Failed to update amenity', 'ERROR', error.message);
  }
});

/**
 * @swagger
 * /amenities/{id}:
 *   delete:
 *     summary: Delete an amenity
 *     tags: [Admin - Amenities Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Amenity ObjectId
 *     responses:
 *       200:
 *         description: Amenity deleted successfully
 *       400:
 *         description: Invalid ID format or amenity is in use by properties
 *       404:
 *         description: Amenity not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
const deleteAmenity = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid amenity ID format');
    }

    // Find amenity
    const amenity = await Amenities.findById(id);
    if (!amenity) {
      return failure(res, 404, 'Amenity not found');
    }

    // Check if amenity is in use
    // Option 1: Check usageCount
    if (amenity.usageCount > 0) {
      return failure(
        res,
        400,
        'Cannot delete amenity that is in use by properties. Please remove from properties first.'
      );
    }

    // Option 2: Check if referenced in any Property documents
    const propertyCount = await Properties.countDocuments({ amenities: id });
    if (propertyCount > 0) {
      return failure(
        res,
        400,
        'Cannot delete amenity that is in use by properties. Please remove from properties first.'
      );
    }

    // Delete amenity
    await Amenities.findByIdAndDelete(id);

    return success(res, 'Amenity deleted successfully', {});
  } catch (error) {
    logger.error('Delete amenity failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete amenity', 'ERROR', error.message);
  }
});

module.exports = {
  listAmenities,
  createAmenity,
  updateAmenity,
  deleteAmenity,
};

