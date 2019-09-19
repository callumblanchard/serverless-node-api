// const uuid = require('uuid');
const AWS = require('aws-sdk'); // eslint-disable-line import/no-unresolved
const shortid = require('shortid');

AWS.config.setPromisesDependency(require('bluebird'));

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const slug = text => text
  .toLowerCase()
  .replace(/[^\w ]+/g, '')
  .replace(/ +/g, '-');

const submitJobListingP = (jobListing) => {
  console.log('Submitting job listing');
  const jobInfo = {
    TableName: process.env.JOBLISTING_TABLE,
    Item: jobListing,
  };
  return dynamoDb.put(jobInfo).promise()
    .then(() => jobListing);
};

const jobListingInfo = (jobTitle, jobEmployer, jobSalary, jobLocation) => {
  const timestamp = new Date().getTime();
  return {
    id: `${shortid.generate().toLowerCase()}-${slug(jobTitle)}`,
    jobTitle,
    jobEmployer,
    jobSalary,
    jobLocation,
    submittedAt: timestamp,
    updatedAt: timestamp,
  };
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': true,
  'Access-Control-Allow-Credentials': true,
};

module.exports.submit = (event, context, callback) => {
  const requestBody = JSON.parse(event.body);
  const { jobTitle } = requestBody;
  const { jobEmployer } = requestBody;
  const { jobSalary } = requestBody;
  const { jobLocation } = requestBody;

  if (typeof jobTitle !== 'string'
    || typeof jobEmployer !== 'string'
    || typeof jobLocation !== 'string'
    || typeof jobSalary !== 'number') {
    console.error('Validation Failed');
    callback(new Error('Couldn\'t submit job listing because of validation errors.'));
    return;
  }

  submitJobListingP(jobListingInfo(jobTitle, jobEmployer, jobSalary, jobLocation))
    .then((res) => {
      callback(null, {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          message: `Sucessfully submitted job listing with title ${jobTitle}`,
          jobId: res.id,
        }),
      });
    })
    .catch((err) => {
      console.log(err);
      callback(null, {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: `Unable to submit job listing with title ${jobTitle}`,
        }),
      });
    });
};

module.exports.all = (event, context, callback) => {
  const params = {
    TableName: process.env.JOBLISTING_TABLE,
    ProjectionExpression: 'id, jobTitle, jobEmployer, jobLocation, jobSalary',
  };

  console.log('Scanning job listing table.');
  const onScan = (err, data) => {
    if (err) {
      console.log('Scan failed to load data. Error JSON:', JSON.stringify(err, null, 2));
      return callback(err);
    }
    console.log('Scan succeeded.');
    return callback(null, {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        jobs: data.Items,
      }),
    });
  };

  dynamoDb.scan(params, onScan);
};

module.exports.get = (event, context, callback) => {
  const params = {
    TableName: process.env.JOBLISTING_TABLE,
    Key: {
      id: event.pathParameters.id,
    },
  };

  dynamoDb.get(params).promise()
    .then((result) => {
      const response = {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.Item),
      };
      callback(null, response);
    })
    .catch((error) => {
      console.error(error);
      callback(new Error('Couldn\'t fetch job listing.'));
    });
};

module.exports.delete = (event, context, callback) => {
  const params = {
    TableName: process.env.JOBLISTING_TABLE,
    Key: {
      id: event.pathParameters.id,
    },
  };

  dynamoDb.delete(params).promise()
    .then(() => {
      const response = {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Job listing deleted.',
        }),
      };
      callback(null, response);
    })
    .catch((error) => {
      console.error(error);
      callback(new Error('Couldn\'t delete job listing.'));
    });
};

module.exports.update = (event, context, callback) => {
  const requestBody = JSON.parse(event.body);

  const validation = {
    jobTitle: {
      dtype: 'string',
      slug: ':t',
    },
    jobEmployer: {
      dtype: 'string',
      slug: ':e',
    },
    jobLocation: {
      dtype: 'string',
      slug: ':l',
    },
    jobSalary: {
      dtype: 'number',
      slug: ':s',
    },
  };

  let updateExpression = 'set updatedAt = :u';
  const timestamp = new Date().getTime();
  const expressionAttributeValues = {
    ':u': timestamp,
  };

  Object.keys(requestBody).forEach((key) => {
    if (Object.keys(validation).indexOf(key) === -1) {
      console.error('Unrecognized Key');
      callback(new Error(`${key} is not a recognized job listing parameter.`));
    }

    const keyItem = validation[key];

    // eslint-disable-next-line valid-typeof
    if (typeof requestBody[key] !== keyItem.dtype) {
      console.error('Validation Failed');
      callback(new Error('Couldn\'t update job listing because of validation errors.'));
    }

    updateExpression += `, ${key}=${keyItem.slug}`;

    expressionAttributeValues[keyItem.slug] = requestBody[key];
  });

  const params = {
    TableName: process.env.JOBLISTING_TABLE,
    Key: {
      id: event.pathParameters.id,
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'UPDATED_NEW',
  };

  console.log('Updating job listing');

  dynamoDb.update(params).promise()
    .then((result) => {
      const response = {
        statusCode: 200,
        headers,
        body: JSON.stringify(result),
      };
      callback(null, response);
    })
    .catch((error) => {
      console.error(error);
      callback(new Error('Couldn\'t update job listing.'));
    });
};
