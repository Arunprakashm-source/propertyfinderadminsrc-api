const Users = require('../models/usersModel');
const Properties = require('../models/propertiesModal');
const Newprojects = require('../models/newprojectsModel');
const Reports = require('../models/reportsModel');
const Developer = require('../models/developersModel');
const Agency = require('../models/agenciesModel');
const Agent = require('../models/agentsModel');
const ListingType = require('../models/listingTypeModel');
const BlogPost = require('../models/blogPostModel');
const TeamMember = require('../models/teamMemberModel');
const LegalDocument = require('../models/legalDocumentModel');
const ContactSubmission = require('../models/contactSubmissionModel');
const CmsPage = require('../models/cmsPageModel');
const Testimonial = require('../models/testimonialsModel');
const Banner = require('../models/bannersModel');
const Inquirys = require('../models/inquirysModel');
const ActivityLog = require('../models/activityLogModel');

const OPEN_REPORT_STATUSES = ['pending', 'under-review', 'reviewed', 'escalated'];

const startOfMonth = (year, month) => new Date(year, month, 1);
const endOfMonth = (year, month) => new Date(year, month + 1, 0, 23, 59, 59, 999);

const getLastNMonths = (count) => {
  const months = [];
  const now = new Date();

  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: date.toLocaleString('en-US', { month: 'short' }),
      year: date.getFullYear(),
      month: date.getMonth(),
      start: startOfMonth(date.getFullYear(), date.getMonth()),
      end: endOfMonth(date.getFullYear(), date.getMonth()),
    });
  }

  return months;
};

const calcGrowthPercent = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const formatGrowth = (pct) => {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
};

const formatNumber = (value) => Number(value || 0).toLocaleString('en-US');

const countCreatedInRange = (Model, start, end, extraFilter = {}) =>
  Model.countDocuments({
    ...extraFilter,
    createdAt: { $gte: start, $lte: end },
  });

const buildStatCard = (title, value, growthPct, cardBg, iconBg) => ({
  title,
  value: formatNumber(value),
  growth: formatGrowth(growthPct),
  growthUp: growthPct >= 0,
  cardBg,
  iconBg,
});

const getListingTypeBuckets = async () => {
  const listingTypes = await ListingType.find({ isActive: true }).select('transaction category').lean();

  const buyIds = [];
  const rentIds = [];
  const commercialIds = [];

  listingTypes.forEach((row) => {
    if (row.category === 'commercial') {
      commercialIds.push(row._id);
      return;
    }
    if (row.transaction === 'buy') buyIds.push(row._id);
    if (row.transaction === 'rent') rentIds.push(row._id);
  });

  return { buyIds, rentIds, commercialIds };
};

const getDashboardOverview = async () => {
  const now = new Date();
  const currentMonthStart = startOfMonth(now.getFullYear(), now.getMonth());
  const currentMonthEnd = endOfMonth(now.getFullYear(), now.getMonth());
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthStart = startOfMonth(previousMonthDate.getFullYear(), previousMonthDate.getMonth());
  const previousMonthEnd = endOfMonth(previousMonthDate.getFullYear(), previousMonthDate.getMonth());

  const platformMonths = getLastNMonths(12);
  const reportMonths = getLastNMonths(6);
  const inquiryMonths = getLastNMonths(6);
  const { buyIds, rentIds, commercialIds } = await getListingTypeBuckets();

  const results = await Promise.all([
    Users.countDocuments({}),
    Properties.countDocuments({ status: 'active' }),
    Newprojects.countDocuments({}),
    Reports.countDocuments({ status: { $in: OPEN_REPORT_STATUSES } }),
    countCreatedInRange(Users, currentMonthStart, currentMonthEnd),
    countCreatedInRange(Users, previousMonthStart, previousMonthEnd),
    countCreatedInRange(Properties, currentMonthStart, currentMonthEnd, { status: 'active' }),
    countCreatedInRange(Properties, previousMonthStart, previousMonthEnd, { status: 'active' }),
    countCreatedInRange(Newprojects, currentMonthStart, currentMonthEnd),
    countCreatedInRange(Newprojects, previousMonthStart, previousMonthEnd),
    Reports.countDocuments({
      status: { $in: OPEN_REPORT_STATUSES },
      createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd },
    }),
    Reports.countDocuments({
      status: { $in: OPEN_REPORT_STATUSES },
      createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd },
    }),
    Developer.countDocuments({}),
    Agency.countDocuments({}),
    Agent.countDocuments({}),
    buyIds.length
      ? Properties.countDocuments({ listingType: { $in: buyIds }, status: 'active' })
      : 0,
    rentIds.length
      ? Properties.countDocuments({ listingType: { $in: rentIds }, status: 'active' })
      : 0,
    commercialIds.length
      ? Properties.countDocuments({ listingType: { $in: commercialIds }, status: 'active' })
      : 0,
    Newprojects.countDocuments({ publishStatus: 'published', isActive: true }),
    BlogPost.countDocuments({ status: 'published' }),
    TeamMember.countDocuments({ isActive: true }),
    LegalDocument.countDocuments({ isActive: true }),
    ContactSubmission.countDocuments({}),
    CmsPage.countDocuments({ pageType: 'about', isPublished: true, isActive: true }),
    Testimonial.countDocuments({ isActive: true }),
    Banner.countDocuments({ isActive: true }),
    Promise.all([
      Developer.countDocuments({ invitationStatus: 'accepted', isVerified: false }),
      Agency.countDocuments({ invitationStatus: 'accepted', isVerified: false }),
      Agent.countDocuments({ invitationStatus: 'accepted', isVerified: false }),
    ]).then((rows) => rows.reduce((sum, value) => sum + value, 0)),
    Inquirys.countDocuments({ status: 'new' }),
    Properties.countDocuments({ status: 'pending' }),
    Reports.countDocuments({ status: { $in: OPEN_REPORT_STATUSES }, priority: 'urgent' }),
    ...inquiryMonths.flatMap((month) => [
      Inquirys.countDocuments({
        inquiryCategory: 'property',
        createdAt: { $gte: month.start, $lte: month.end },
      }),
      Inquirys.countDocuments({
        inquiryCategory: 'project',
        createdAt: { $gte: month.start, $lte: month.end },
      }),
    ]),
    ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .select('action actor.actorType resource.resourceType createdAt')
      .lean(),
    ...platformMonths.flatMap((month) => [
      countCreatedInRange(Users, month.start, month.end),
      countCreatedInRange(Properties, month.start, month.end),
    ]),
    ...reportMonths.flatMap((month) => [
      Reports.countDocuments({
        status: { $in: OPEN_REPORT_STATUSES },
        createdAt: { $gte: month.start, $lte: month.end },
      }),
      Reports.countDocuments({
        status: 'resolved',
        createdAt: { $gte: month.start, $lte: month.end },
      }),
    ]),
  ]);

  let index = 0;
  const totalUsers = results[index++];
  const activeListings = results[index++];
  const totalProjects = results[index++];
  const pendingReports = results[index++];
  const newUsersCurrentMonth = results[index++];
  const newUsersPreviousMonth = results[index++];
  const newListingsCurrentMonth = results[index++];
  const newListingsPreviousMonth = results[index++];
  const newProjectsCurrentMonth = results[index++];
  const newProjectsPreviousMonth = results[index++];
  const pendingReportsCurrentMonth = results[index++];
  const pendingReportsPreviousMonth = results[index++];
  const developersCount = results[index++];
  const agenciesCount = results[index++];
  const agentsCount = results[index++];
  const buyListings = results[index++];
  const rentListings = results[index++];
  const commercialListings = results[index++];
  const newProjectListings = results[index++];
  const blogsCount = results[index++];
  const teamCount = results[index++];
  const legalCount = results[index++];
  const contactCount = results[index++];
  const aboutCount = results[index++];
  const testimonialsCount = results[index++];
  const bannersCount = results[index++];
  const pendingApprovals = results[index++];
  const newInquiries = results[index++];
  const pendingListings = results[index++];
  const urgentReports = results[index++];

  const inquiryValueCount = inquiryMonths.length * 2;
  const inquiryCounts = results.slice(index, index + inquiryValueCount);
  index += inquiryValueCount;

  const recentActivityRows = results[index++] || [];
  const monthlyCounts = results.slice(index);

  const newUsersByMonth = [];
  const newListingsByMonth = [];
  const inquiryPropertyByMonth = [];
  const inquiryProjectByMonth = [];
  for (let i = 0; i < inquiryMonths.length; i += 1) {
    inquiryPropertyByMonth.push(inquiryCounts[i * 2]);
    inquiryProjectByMonth.push(inquiryCounts[i * 2 + 1]);
  }

  for (let i = 0; i < platformMonths.length; i += 1) {
    newUsersByMonth.push(monthlyCounts[i * 2]);
    newListingsByMonth.push(monthlyCounts[i * 2 + 1]);
  }

  const reportOffset = platformMonths.length * 2;
  const openReportsByMonth = [];
  const resolvedReportsByMonth = [];
  for (let i = 0; i < reportMonths.length; i += 1) {
    openReportsByMonth.push(monthlyCounts[reportOffset + i * 2]);
    resolvedReportsByMonth.push(monthlyCounts[reportOffset + i * 2 + 1]);
  }

  return {
    statCards: [
      buildStatCard(
        'Total Users',
        totalUsers,
        calcGrowthPercent(newUsersCurrentMonth, newUsersPreviousMonth),
        'bg-[#F3EEFF]',
        'bg-[#6A3CA8]'
      ),
      buildStatCard(
        'Active Listings',
        activeListings,
        calcGrowthPercent(newListingsCurrentMonth, newListingsPreviousMonth),
        'bg-[#E8F5EE]',
        'bg-[#00A663]'
      ),
      buildStatCard(
        'Total Projects',
        totalProjects,
        calcGrowthPercent(newProjectsCurrentMonth, newProjectsPreviousMonth),
        'bg-[#E8F0FF]',
        'bg-[#0832AE]'
      ),
      buildStatCard(
        'Pending Reports',
        pendingReports,
        calcGrowthPercent(pendingReportsCurrentMonth, pendingReportsPreviousMonth),
        'bg-[#FFF2F2]',
        'bg-[#EA3934]'
      ),
    ],
    platformGrowth: {
      categories: platformMonths.map((month) => month.label),
      series: [
        { name: 'New Users', data: newUsersByMonth },
        { name: 'New Listings', data: newListingsByMonth },
      ],
    },
    userDistribution: {
      labels: ['Developers', 'Agencies', 'Agents', 'End Users'],
      series: [developersCount, agenciesCount, agentsCount, totalUsers],
    },
    listingsByType: {
      categories: ['Buy', 'Rent', 'Commercial', 'New Projects'],
      series: [{ name: 'Listings', data: [buyListings, rentListings, commercialListings, newProjectListings] }],
    },
    reportsMonthly: {
      categories: reportMonths.map((month) => month.label),
      series: [
        { name: 'Open', data: openReportsByMonth },
        { name: 'Resolved', data: resolvedReportsByMonth },
      ],
    },
    cmsActivity: {
      labels: ['Blogs', 'Team', 'Legal', 'Contact', 'About', 'Testimonials', 'Banners'],
      series: [blogsCount, teamCount, legalCount, contactCount, aboutCount, testimonialsCount, bannersCount],
    },
    actionQueue: [
      { title: 'Pending Approvals', value: pendingApprovals, path: '/developeraccount' },
      { title: 'New Inquiries', value: newInquiries, path: '/listingpropertyinquiry' },
      { title: 'Pending Listings', value: pendingListings, path: '/listingproperty' },
      { title: 'Urgent Reports', value: urgentReports, path: '/reportsmanagement' },
    ],
    inquiriesOverview: {
      categories: inquiryMonths.map((month) => month.label),
      series: [
        { name: 'Property Inquiries', data: inquiryPropertyByMonth },
        { name: 'Project Inquiries', data: inquiryProjectByMonth },
      ],
    },
    recentActivity: (recentActivityRows || [])
      .filter(Boolean)
      .map((row) => ({
        id: String(row._id),
        action: row.action || 'other',
        actorType: row.actor?.actorType || 'system',
        resourceType: row.resource?.resourceType || 'other',
        createdAt: row.createdAt,
      })),
  };
};

module.exports = {
  getDashboardOverview,
};
