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

const mockGigs = [...Array(12).keys()].map(i => ({
  slug: `band${i}-location${i}`,
  bandName: `Mock Band ${i}`,
  city: `Mock City ${i}`,
  year: '1961',
  date: '2019-01-01',
  venue: `Mock Venue ${i}`,
  collectionPointMap: 'map-placeholder.png',
  collectionPoint: 'New York, NY 10001, USA',
  collectionTime: '14:30',
  originalDate: '1977-02-05',
  capacity: 3000,
  description: `Mock description ${i}`,
  image: 'band-placeholder.png',
  price: '1010'
}))

function findGigBySlug (slug) {
  return mockGigs.find(gig => gig.slug === slug)
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
  const gig = findGigBySlug(slug)
  const result = gig
    ? response(200, gig)
    : response(404, { error: 'Gig not found' })
  return callback(null, result)
}
