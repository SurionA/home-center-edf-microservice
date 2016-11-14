var request = require('request');
var jsdom = require("jsdom");
var Q = require("q");
var dotenv = require('dotenv-safe');

var requestCookies;
var edfParticulierLoginUrl = 'https://particulier.edf.fr/bin/edf_rc/servlets/authentication';
var edfEquilibreStatusUrl = 'https://particulier.edf.fr/bin/edf_rc/servlet/context/equilibreStatus';
var edfSamlUrl = 'https://equilibre.edf.fr/saml-sp';
var edfEquilibreUrl = 'https://equilibre.edf.fr/drupal_ajax_get_data_conso_year/web_conso/2016';

dotenv.load({
  path: __dirname + '/config/.env',
  sample: __dirname + '/config/.env.example',
  allowEmptyValues: false
});

var edfLoginOptions = {
  uri: edfParticulierLoginUrl,
  method: 'POST',
  form: {
    login: process.env.EDF_LOGIN,
    password: process.env.EDF_PASSWORD
  }
};

var edfEquilibreStatusOptions = {
  uri: edfEquilibreStatusUrl,
  method: 'POST',
  headers: {}
};

var edfSsoOptions = {
  headers: {}
};

var edfSAMLOptions = {
  uri: edfSamlUrl,
  method: 'POST',
  headers: {},
  form: {}
};

function edfEquilibreStatusCall (response) {
  requestCookies = response[0].headers['set-cookie'].join(';');
  edfEquilibreStatusOptions.headers.cookie = requestCookies;

  return Q.nfcall(request, edfEquilibreStatusOptions);
}

function edfSsoCall (response) {
  var edfEquilibreStatusResponse = JSON.parse(response[0].body);

  if (!edfEquilibreStatusResponse.isActiveEquilibre || !edfEquilibreStatusResponse.isEquilibreServiceSubscribed || !edfEquilibreStatusResponse.isEligibleToEquilibreService) {
    throw new Error('Equilibre Service is not available. Please active it on your edf admin panel');
  }

  edfSsoOptions.uri = edfEquilibreStatusResponse.edeliaURL.replace(':443', '');
  edfSsoOptions.headers.cookie = requestCookies;

  return Q.nfcall(request, edfSsoOptions);
}

function edfSAMLCookie (response) {
  requestCookies = requestCookies + ';'  + response[0].headers['set-cookie'].join(';');
  edfSAMLOptions.headers.cookie = requestCookies;

  return response[0].body;
}

function setSAMLResponse (body) {
  return Q.nfcall(jsdom.env, body, ["http://code.jquery.com/jquery.js"]);
}

function edfSamlCall (window) {
  edfSAMLOptions.form.SAMLResponse = window.$("input[name='SAMLResponse']").val();

  return Q.nfcall(request, edfSAMLOptions);
}

function edfEquilibreCall (response) {
  requestCookies = requestCookies + ';'  + response[0].headers['set-cookie'].join(';');

  return Q.nfcall(request, {url: edfEquilibreUrl, headers: {cookie: requestCookies}});
}

Q.nfcall(request, edfLoginOptions)
  .then(edfEquilibreStatusCall)
  .then(edfSsoCall)
  .then(edfSAMLCookie)
  .then(setSAMLResponse)
  .then(edfSamlCall)
  .then(edfEquilibreCall)
  .then(function (response) {
    console.log('MY CONSOMMATION response.headers',response[0].headers);
    console.log('MY CONSOMMATION',response[0].body);
  })
  .catch(function(err) {
    console.log(err);
  });
