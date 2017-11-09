const AWS = require('aws-sdk')
const docClient = new AWS.DynamoDB.DocumentClient()
const validator = require('validator')

const Gig = {
  findAll (result) {
    const queryParams = { TableName: 'gig' }
    docClient.scan(queryParams, (err, data) => {
      if (err) {
        console.error(err)
        throw err
      }

      return result(data.Items)
    })
  },

  findBySlug (slug, result) {
    const queryParams = {
      Key: { slug: slug },
      TableName: 'gig'
    }
    docClient.get(queryParams, (err, data) => {
      if (err) {
        console.error(err)
        throw err
      }
      return result(data.Item)
    })
  }
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

function withErrorHandler (block) {
  try {
    block()
  } catch (err) {
    console.error(err)
    return callback(null, response(500, { message: 'Internal server error' }))
  }
}

exports.listGigs = (event, context, callback) => {
  withErrorHandler(() => {
    return Gig.findAll(gigs => {
      return callback(null, response(200, { gigs }))
    })
  })
}

exports.gig = (event, context, callback) => {
  withErrorHandler(() => {
    const { pathParameters: { slug } } = event
    return Gig.findBySlug(slug, gig => {
      const result = gig
        ? response(200, gig)
        : response(404, { error: 'Gig not found' })
      return callback(null, result)
    })
  })
}

const Purchase = {
  fields: [
    'gig',
    'name',
    'email',
    'cardNumber',
    'cardExpiryMonth',
    'cardExpiryYear',
    'cardCVC',
    'disclaimerAccepted'
  ],

  parseAndValidate (rawData, callback, success) {
    const errors = []
    let data

    try {
      data = JSON.parse(rawData)
    } catch (err) {
      return callback(
        null,
        response(400, { error: 'Invalid content, expected valid JSON' })
      )
    }
    this.fields.forEach(field => {
      if (!data[field]) {
        errors.push({ field: field, message: 'field is mandatory' })
      }
    })
    if (errors.length) {
      return callback(null, response(400, { error: 'Invalid request', errors }))
    }

    // 2. validate all other fields
    // ...

    success(data)
  }
}

exports.purchaseTicket = (event, context, callback) => {
  Purchase.parseAndValidate(event.body, callback, data => {
    Gig.findBySlug(data.gig, gig => {
      if (!gig) return callback(null, response(404, { error: 'Gig not found' }))
    })
  })

  // 4. if everything went well return a 202 (accepted)
  // ...

  return callback(null, response(202, { success: true }))
}

exports.cors = (event, context, callback) => {
  callback(null, {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers':
        'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'
    },
    body: ''
  })
}
