const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const Reports = require('../models/reportsModel');
const Properties = require('../models/propertiesModal');
const Newprojects = require('../models/newprojectsModel');
const Agents = require('../models/agentsModel');
const Agencies = require('../models/agenciesModel');
const Users = require('../models/usersModel');
const Ratingreviews = require('../models/ratingreviewsModel');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

const { Types } = mongoose;

const REPORT_TYPES = new Set(['property', 'agent', 'agency', 'user', 'review', 'project']);
const REPORT_STATUSES = new Set([
  'pending',
  'under-review',
  'reviewed',
  'resolved',
  'rejected',
  'escalated',
]);
const REPORT_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const USER_TYPES = new Set(['developer', 'agency', 'agent', 'user']);

const getAdminId = (req) => req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;

const parsePage = (value, fallback = 1) => {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
};

const escapeRegex = (text = '') => text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatAdminName = (admin) => {
  if (!admin) return '—';
  const full = [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim();
  return full || admin.email || '—';
};

const resolveReportedItemLabels = async (reports) => {
  const idsByType = {
    property: new Set(),
    project: new Set(),
    agent: new Set(),
    agency: new Set(),
    user: new Set(),
    review: new Set(),
  };

  reports.forEach((report) => {
    const type = String(report.reportType || '').trim();
    const itemId = report.reportedItem ? String(report.reportedItem) : '';
    if (type && itemId && idsByType[type]) {
      idsByType[type].add(itemId);
    }
  });

  const toObjectIds = (set) => [...set].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));

  const [
    properties,
    projects,
    agents,
    agencies,
    users,
    reviews,
  ] = await Promise.all([
    idsByType.property.size
      ? Properties.find({ _id: { $in: toObjectIds(idsByType.property) } }).select('title').lean()
      : Promise.resolve([]),
    idsByType.project.size
      ? Newprojects.find({ _id: { $in: toObjectIds(idsByType.project) } }).select('projectName').lean()
      : Promise.resolve([]),
    idsByType.agent.size
      ? Agents.find({ _id: { $in: toObjectIds(idsByType.agent) } }).select('fullName email').lean()
      : Promise.resolve([]),
    idsByType.agency.size
      ? Agencies.find({ _id: { $in: toObjectIds(idsByType.agency) } }).select('agencyName email').lean()
      : Promise.resolve([]),
    idsByType.user.size
      ? Users.find({ _id: { $in: toObjectIds(idsByType.user) } }).select('firstName lastName email').lean()
      : Promise.resolve([]),
    idsByType.review.size
      ? Ratingreviews.find({ _id: { $in: toObjectIds(idsByType.review) } }).select('title review').lean()
      : Promise.resolve([]),
  ]);

  const labelMaps = {
    property: new Map(properties.map((row) => [String(row._id), row.title || `Property ${row._id}`])),
    project: new Map(projects.map((row) => [String(row._id), row.projectName || `Project ${row._id}`])),
    agent: new Map(
      agents.map((row) => [String(row._id), row.fullName || row.email || `Agent ${row._id}`])
    ),
    agency: new Map(
      agencies.map((row) => [String(row._id), row.agencyName || row.email || `Agency ${row._id}`])
    ),
    user: new Map(
      users.map((row) => {
        const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
        return [String(row._id), name || row.email || `User ${row._id}`];
      })
    ),
    review: new Map(
      reviews.map((row) => [String(row._id), row.title || row.review || `Review ${row._id}`])
    ),
  };

  return reports.map((report) => {
    const type = String(report.reportType || '').trim();
    const itemId = report.reportedItem ? String(report.reportedItem) : '';
    const label =
      (type && itemId && labelMaps[type]?.get(itemId)) ||
      (itemId ? `${type || 'Item'} ${itemId}` : 'General report');

    return { ...report, reportedItemLabel: label };
  });
};

const findReportedItemIdsBySearch = async (searchText) => {
  const q = String(searchText || '').trim();
  if (!q) return [];
  const regex = new RegExp(escapeRegex(q), 'i');

  const [properties, projects, agents, agencies, users, reviews] = await Promise.all([
    Properties.find({ title: regex }).select('_id').lean(),
    Newprojects.find({ projectName: regex }).select('_id').lean(),
    Agents.find({ $or: [{ fullName: regex }, { email: regex }] }).select('_id').lean(),
    Agencies.find({ $or: [{ agencyName: regex }, { email: regex }] }).select('_id').lean(),
    Users.find({
      $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
    })
      .select('_id')
      .lean(),
    Ratingreviews.find({ $or: [{ title: regex }, { review: regex }] }).select('_id').lean(),
  ]);

  return [
    ...properties,
    ...projects,
    ...agents,
    ...agencies,
    ...users,
    ...reviews,
  ].map((row) => row._id);
};

/**
 * @swagger
 * /reports:
 *   get:
 *     summary: List reports with filters and pagination
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, under-review, reviewed, resolved, rejected, escalated]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *           enum: [property, agent, agency, user, review, project]
 *       - in: query
 *         name: userType
 *         schema:
 *           type: string
 *           enum: [developer, agency, agent, user]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: counts
 *         schema:
 *           type: boolean
 *         description: Include dashboard counters in response.
 *     responses:
 *       200:
 *         description: Reports fetched successfully.
 *       400:
 *         description: Invalid query parameter.
 *       500:
 *         description: Server error.
 */
const listReports = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      reportType,
      userType,
      search,
      startDate,
      endDate,
      counts,
    } = req.query;

    const pageNum = parsePage(page, 1);
    const limitNum = Math.min(parsePage(limit, 10), 100);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status && REPORT_STATUSES.has(status)) filter.status = status;
    if (priority && REPORT_PRIORITIES.has(priority)) filter.priority = priority;
    if (reportType && REPORT_TYPES.has(reportType)) filter.reportType = reportType;
    if (userType && USER_TYPES.has(userType)) filter.userType = userType;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (Number.isNaN(start.getTime())) {
          return failure(res, 400, 'Invalid startDate', 'VALIDATION_ERROR');
        }
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) {
          return failure(res, 400, 'Invalid endDate', 'VALIDATION_ERROR');
        }
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (search && String(search).trim()) {
      const regex = new RegExp(escapeRegex(String(search)), 'i');
      const matchingReportedItemIds = await findReportedItemIdsBySearch(search);
      filter.$or = [
        { reporterEmail: regex },
        { reason: regex },
        { description: regex },
        ...(matchingReportedItemIds.length
          ? [{ reportedItem: { $in: matchingReportedItemIds } }]
          : []),
      ];
    }

    const [reportsRaw, total, countAgg] = await Promise.all([
      Reports.find(filter)
        .populate('reviewedBy', 'firstName lastName email')
        .populate('resolution.resolvedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Reports.countDocuments(filter),
      counts === 'true' || counts === true
        ? Reports.aggregate([
            { $match: {} },
            {
              $facet: {
                pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
                underReview: [{ $match: { status: 'under-review' } }, { $count: 'count' }],
                resolved: [{ $match: { status: 'resolved' } }, { $count: 'count' }],
                urgentOpen: [
                  { $match: { priority: 'urgent', status: { $nin: ['resolved', 'rejected'] } } },
                  { $count: 'count' },
                ],
              },
            },
          ])
        : Promise.resolve([]),
    ]);

    const reportsWithLabel = await resolveReportedItemLabels(reportsRaw);
    const reports = reportsWithLabel.map((row) => ({
      _id: row._id,
      reportType: row.reportType,
      reportedItem: row.reportedItem,
      reportedItemLabel: row.reportedItemLabel,
      reportedBy: row.reportedBy || null,
      reporterEmail: row.reporterEmail || '—',
      userType: row.userType || 'user',
      reason: row.reason || '',
      description: row.description || '',
      attachments: row.attachments || [],
      status: row.status || 'pending',
      priority: row.priority || 'medium',
      reviewedBy: row.reviewedBy ? formatAdminName(row.reviewedBy) : null,
      reviewedAt: row.reviewedAt || null,
      actionTaken: row.actionTaken || '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    const countsData =
      countAgg && countAgg[0]
        ? {
            pending: countAgg[0].pending?.[0]?.count ?? 0,
            underReview: countAgg[0].underReview?.[0]?.count ?? 0,
            resolved: countAgg[0].resolved?.[0]?.count ?? 0,
            urgentOpen: countAgg[0].urgentOpen?.[0]?.count ?? 0,
          }
        : undefined;

    return success(res, 'Reports fetched successfully', {
      reports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
      ...(countsData ? { counts: countsData } : {}),
    });
  } catch (error) {
    logger.error('List reports failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch reports', 'SERVER_ERROR');
  }
});

/**
 * @swagger
 * /reports/{id}:
 *   get:
 *     summary: Get report detail by id
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report ObjectId.
 *     responses:
 *       200:
 *         description: Report fetched successfully.
 *       400:
 *         description: Invalid report ID.
 *       404:
 *         description: Report not found.
 *       500:
 *         description: Server error.
 */
const getReportById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid report ID', 'VALIDATION_ERROR');
    }

    const reportRaw = await Reports.findById(id)
      .populate('reviewedBy', 'firstName lastName email')
      .populate('resolution.resolvedBy', 'firstName lastName email')
      .populate('internalNotes.addedBy', 'firstName lastName email')
      .lean();

    if (!reportRaw) {
      return failure(res, 404, 'Report not found', 'NOT_FOUND');
    }

    const [report] = await resolveReportedItemLabels([reportRaw]);

    return success(res, 'Report fetched successfully', {
      report: {
        _id: report._id,
        reportType: report.reportType,
        reportedItem: report.reportedItem,
        reportedItemLabel: report.reportedItemLabel,
        reportedBy: report.reportedBy || null,
        reporterEmail: report.reporterEmail || '—',
        userType: report.userType || 'user',
        reason: report.reason || '',
        description: report.description || '',
        attachments: report.attachments || [],
        status: report.status || 'pending',
        priority: report.priority || 'medium',
        reviewNotes: report.reviewNotes || '',
        reviewedBy: report.reviewedBy ? formatAdminName(report.reviewedBy) : null,
        reviewedAt: report.reviewedAt || null,
        actionTaken: report.actionTaken || '',
        resolution: report.resolution
          ? {
              status: report.resolution.status || '',
              notes: report.resolution.notes || '',
              resolvedBy: report.resolution.resolvedBy
                ? formatAdminName(report.resolution.resolvedBy)
                : null,
              resolvedAt: report.resolution.resolvedAt || null,
            }
          : null,
        internalNotes: (report.internalNotes || []).map((n) => ({
          note: n.note || '',
          addedBy: n.addedBy ? formatAdminName(n.addedBy) : '—',
          addedAt: n.addedAt || null,
        })),
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Get report failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch report', 'SERVER_ERROR');
  }
});

/**
 * @swagger
 * /reports/{id}:
 *   put:
 *     summary: Update report status, priority, review, or resolution
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report ObjectId.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, under-review, reviewed, resolved, rejected, escalated]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               reviewNotes:
 *                 type: string
 *               actionTaken:
 *                 type: string
 *               resolution:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                   notes:
 *                     type: string
 *     responses:
 *       200:
 *         description: Report updated successfully.
 *       400:
 *         description: Validation error.
 *       404:
 *         description: Report not found.
 *       500:
 *         description: Server error.
 */
const updateReport = asyncHandler(async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const { id } = req.params;
    const { status, priority, reviewNotes, actionTaken, resolution } = req.body || {};

    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid report ID', 'VALIDATION_ERROR');
    }

    const report = await Reports.findById(id);
    if (!report) {
      return failure(res, 404, 'Report not found', 'NOT_FOUND');
    }

    if (status !== undefined) {
      if (!REPORT_STATUSES.has(String(status))) {
        return failure(res, 400, 'Invalid status', 'VALIDATION_ERROR');
      }
      report.status = status;
    }

    if (priority !== undefined) {
      if (!REPORT_PRIORITIES.has(String(priority))) {
        return failure(res, 400, 'Invalid priority', 'VALIDATION_ERROR');
      }
      report.priority = priority;
    }

    if (reviewNotes !== undefined) {
      report.reviewNotes = String(reviewNotes || '').trim();
      report.reviewedAt = new Date();
      if (adminId && Types.ObjectId.isValid(adminId)) {
        report.reviewedBy = adminId;
      }
    }

    if (actionTaken !== undefined) {
      report.actionTaken = String(actionTaken || '').trim();
      report.reviewedAt = new Date();
      if (adminId && Types.ObjectId.isValid(adminId)) {
        report.reviewedBy = adminId;
      }
    }

    if (resolution && typeof resolution === 'object') {
      const resolutionStatus = String(resolution.status || '').trim() || 'resolved';
      const resolutionNotes = String(resolution.notes || '').trim();
      report.resolution = {
        status: resolutionStatus,
        notes: resolutionNotes,
        resolvedBy: adminId && Types.ObjectId.isValid(adminId) ? adminId : report.resolution?.resolvedBy,
        resolvedAt: new Date(),
      };

      if (resolutionStatus === 'resolved') {
        report.status = 'resolved';
      }
    }

    await report.save();

    return success(res, 'Report updated successfully', { reportId: report._id });
  } catch (error) {
    logger.error('Update report failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update report', 'SERVER_ERROR');
  }
});

/**
 * @swagger
 * /reports/{id}/internal-notes:
 *   post:
 *     summary: Append internal note to a report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report ObjectId.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [note]
 *             properties:
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Internal note added successfully.
 *       400:
 *         description: Validation error.
 *       404:
 *         description: Report not found.
 *       500:
 *         description: Server error.
 */
const addInternalNote = asyncHandler(async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const { id } = req.params;
    const { note } = req.body || {};

    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid report ID', 'VALIDATION_ERROR');
    }
    if (!note || !String(note).trim()) {
      return failure(res, 400, 'note is required', 'VALIDATION_ERROR');
    }

    const report = await Reports.findById(id);
    if (!report) {
      return failure(res, 404, 'Report not found', 'NOT_FOUND');
    }

    report.internalNotes = report.internalNotes || [];
    report.internalNotes.unshift({
      note: String(note).trim(),
      addedBy: adminId && Types.ObjectId.isValid(adminId) ? adminId : undefined,
      addedAt: new Date(),
    });
    await report.save();

    return success(res, 'Internal note added successfully', { reportId: report._id });
  } catch (error) {
    logger.error('Add report internal note failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to add internal note', 'SERVER_ERROR');
  }
});

/**
 * @swagger
 * /reports/{id}:
 *   delete:
 *     summary: Delete report by id
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report ObjectId.
 *     responses:
 *       200:
 *         description: Report deleted successfully.
 *       400:
 *         description: Invalid report ID.
 *       404:
 *         description: Report not found.
 *       500:
 *         description: Server error.
 */
const deleteReport = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid report ID', 'VALIDATION_ERROR');
    }

    const report = await Reports.findById(id).select('_id');
    if (!report) {
      return failure(res, 404, 'Report not found', 'NOT_FOUND');
    }

    await Reports.deleteOne({ _id: id });
    return success(res, 'Report deleted successfully', { reportId: id });
  } catch (error) {
    logger.error('Delete report failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete report', 'SERVER_ERROR');
  }
});

module.exports = {
  listReports,
  getReportById,
  updateReport,
  addInternalNote,
  deleteReport,
};

