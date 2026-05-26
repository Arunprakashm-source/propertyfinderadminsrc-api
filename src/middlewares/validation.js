const { body, validationResult } = require('express-validator');

const passwordRule = (field = 'password') =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[^\w\s]/)
    .withMessage('Password must contain at least one special character');

const phoneRule = (field = 'phoneNumber', { required = true } = {}) => {
  let chain = body(field).trim();

  chain = required
    ? chain.notEmpty().withMessage('Phone number is required')
    : chain.optional({ checkFalsy: true });

  return chain.matches(/^\+?[1-9]\d{7,14}$/).withMessage('Phone number must be a valid international format');
};

const emailRule = ({ required = true } = {}) => {
  let chain = body('email').trim();

  chain = required ? chain.notEmpty().withMessage('Email is required') : chain.optional({ checkFalsy: true });

  return chain.isEmail().withMessage('Email must be valid');
};

const registerUserValidation = [
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  emailRule(),
  passwordRule('password'),
  phoneRule(),
];

const loginValidation = [
  emailRule({ required: false }),
  phoneRule('phoneNumber', { required: false }),
  body('password').trim().notEmpty().withMessage('Password is required'),
  body().custom((_, { req }) => {
    if (!req.body.email && !req.body.phoneNumber) {
      throw new Error('Either email or phone number is required');
    }
    return true;
  }),
];

const emailValidation = [emailRule()];
const phoneValidation = [phoneRule()];
const otpValidation = [
  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be exactly 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers'),
];

const passwordValidation = [passwordRule()];

const resetPasswordValidation = [
  body('token').trim().notEmpty().withMessage('Token is required'),
  passwordRule('newPassword'),
];

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: errors.array().map((error) => ({
        field: error.path || error.param,
        message: error.msg,
      })),
    });
  }

  return next();
};

module.exports = {
  registerUserValidation,
  loginValidation,
  emailValidation,
  phoneValidation,
  otpValidation,
  passwordValidation,
  resetPasswordValidation,
  validateRequest,
};
