/**
 * Global list-page stat counts (not filtered by search/pagination).
 */

const countUserListStats = async (UsersModel) => {
  const [total, active, inactive, banned] = await Promise.all([
    UsersModel.countDocuments({}),
    UsersModel.countDocuments({ isActive: true, isBanned: false }),
    UsersModel.countDocuments({ isActive: false }),
    UsersModel.countDocuments({ isBanned: true }),
  ]);

  return { total, active, inactive, banned };
};

const countInvitationAccountStats = async (Model) => {
  const [total, active, inactive, approvalPending, declined, invited, expired] =
    await Promise.all([
      Model.countDocuments({}),
      Model.countDocuments({
        invitationStatus: 'accepted',
        isVerified: true,
        isActive: true,
      }),
      Model.countDocuments({
        invitationStatus: 'accepted',
        isVerified: true,
        isActive: false,
      }),
      Model.countDocuments({
        invitationStatus: 'accepted',
        isVerified: false,
      }),
      Model.countDocuments({ invitationStatus: 'declined' }),
      Model.countDocuments({ invitationStatus: 'pending' }),
      Model.countDocuments({ invitationStatus: 'expired' }),
    ]);

  return {
    total,
    active,
    inactive,
    approvalPending,
    declined,
    invited,
    expired,
  };
};

module.exports = {
  countUserListStats,
  countInvitationAccountStats,
};
