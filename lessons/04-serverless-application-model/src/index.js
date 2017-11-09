const AWS = require('aws-sdk')
const docClient = new AWS.DynamoDB.DocumentClient()

function findAllGigs (result) {
  const queryParams = { TableName: 'gig' }
  docClient.scan(queryParams, (err, data) => {
    if (err) {
      console.error(err)
      throw err
    }

    return result(data.Items)
  })
}

function findGigBySlug (slug, result) {
  const queryParams = {
    Key: {
      thePrimaryKey: 'slug'
    },
    TableName: 'gig'
  }
  docClient.get(queryParams, (err, data) => {
    if (err) {
      console.error(err)
      throw err
    }
    result(data.Item)
  })
}

function response (code, body) {
  return {
    statusCode: code,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }
}

exports.listGigs = (event, context, callback) => {
  return findAllGigs(gigs => {
    callback(null, response(200, { gigs }))
  })
}

exports.gig = (event, context, callback) => {
  const { pathParameters: { slug } } = event
  return findGigBySlug(slug, gig => {
    const result = gig
      ? response(200, gig)
      : response(404, { error: 'Gig not found' })
    callback(null, result)
  })
}
