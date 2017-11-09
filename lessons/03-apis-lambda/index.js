exports.handler = (event, context, callback) => {
  try {
    const name =
      event.queryStringParameters && event.queryStringParameters.name
        ? event.queryStringParameters.name
        : 'World'
    const body = JSON.stringify({
      message: `Hello ${name}`
    })

    const response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body
    }

    callback(null, response)
  } catch (err) {
    console.error(err)
    return callback(null, {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: { error: 'Internal server error' }
    })
  }
}
