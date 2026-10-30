/**
 * js/company-config.js
 * Central Official Company Branding & Details Configuration for Anjani Agri Care Invoice Builder
 */
(function(global) {
  'use strict';

  const COMPANY_CONFIG = {
    name: 'Anjani Agri Care',
    shortName: 'Anjani Agri Care',
    brandName: 'Anjani Agri Care',
    code: 'AAC',
    symbol: 'AAC',
    abbreviation: 'AAC',
    address: 'Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.',
    city: 'Rajkot',
    state: 'Gujarat',
    pincode: '360024',
    phone: '96646 75227',
    phoneClean: '9664675227',
    phoneDisplay: '+91 96646 75227',
    email: 'anjaniagricare@gmail.com',
    signatureText: 'Tirth',
    signatoryRole: 'Authorized Signatory',
    gstin: '24AERFS1718Q1ZB',
    pan: 'AAACA1234A',
    themeColor: '#0C3925',
    themeColorDark: '#08281A',
    logoUrl: '../assets/images/logo.jpg',
    logoUrlFallback: 'logo.jpg'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = COMPANY_CONFIG;
  }
  if (typeof global !== 'undefined') {
    global.COMPANY_CONFIG = COMPANY_CONFIG;
  }
})(typeof window !== 'undefined' ? window : this);
