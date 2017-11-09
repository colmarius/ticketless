const AWS = require('aws-sdk')
const docClient = new AWS.DynamoDB.DocumentClient()
const sns = new AWS.SNS()
const sqs = new AWS.SQS()

const validator = require('validator')
const uuidv4 = require('uuid/v4')
const nodemailer = require('nodemailer')
const smtpTransport = require('nodemailer-smtp-transport')

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

    if (!validator.isEmail(data.email)) {
      errors.push({ field: 'email', message: 'field is not a valid email' })
    }
    if (!validator.isCreditCard(data.cardNumber)) {
      errors.push({
        field: 'cardNumber',
        message: 'field is not a valid credit card number'
      })
    }
    if (!validator.isInt(String(data.cardExpiryMonth), { min: 1, max: 12 })) {
      errors.push({
        field: 'cardExpiryMonth',
        message: 'field must be an integer in range [1,12]'
      })
    }
    if (
      !validator.isInt(String(data.cardExpiryYear), { min: 2018, max: 2024 })
    ) {
      errors.push({
        field: 'cardExpiryYear',
        message: 'field must be an integer in range [2018,2024]'
      })
    }
    if (!String(data.cardCVC).match(/^[0-9]{3,4}$/)) {
      errors.push({ field: 'cardCVC', message: 'field must be a valid CVC' })
    }
    if (data.disclaimerAccepted !== true) {
      errors.push({
        field: 'disclaimerAccepted',
        message: 'field must be true'
      })
    }

    if (errors.length) {
      return callback(null, response(400, { error: 'Invalid request', errors }))
    }

    success(data)
  }
}

exports.purchaseTicket = (event, context, callback) => {
  Purchase.parseAndValidate(event.body, callback, data => {
    Gig.findBySlug(data.gig, gig => {
      if (!gig) return callback(null, response(404, { error: 'Gig not found' }))

      const ticket = {
        id: uuidv4(),
        createdAt: Date.now(),
        name: data.name,
        email: data.email,
        gig: data.gig
      }

      sns.publish(
        {
          TopicArn: process.env.SNS_TOPIC_ARN,
          Message: JSON.stringify({ ticket, gig })
        },
        (err, data) => {
          if (err) {
            console.error(err)
            return callback(
              null,
              response(500, { message: 'Internal server error' })
            )
          }
          return callback(null, response(202, { success: true }))
        }
      )
    })
  })
}

const Queue = {
  nextMessage (onMessageReceived) {
    const { SQS_QUEUE_URL } = process.env

    const receiveMessageParams = {
      QueueUrl: SQS_QUEUE_URL,
      MaxNumberOfMessages: 1
    }

    sqs.receiveMessage(receiveMessageParams, (err, data) => {
      onMessageReceived(err, data)
    })
  }
}

const Mailer = {
  sendEmail ({ to, subject, text }, result) {
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USERNAME,
      SMTP_PASSWORD,
      SMTP_SENDER_ADDRESS
    } = process.env
    const transporter = nodemailer.createTransport(
      smtpTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        auth: {
          user: SMTP_USERNAME,
          pass: SMTP_PASSWORD
        }
      })
    )
    const mailOptions = {
      from: SMTP_SENDER_ADDRESS,
      to,
      subject,
      text
    }

    console.log({
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USERNAME,
      SMTP_PASSWORD,
      SMTP_SENDER_ADDRESS,
      SMTP_SENDER_ADDRESS,
      mailOptions
    })

    transporter.sendMail(mailOptions, (err, info) => {
      return result(err, info)
    })
  }
}

exports.sendMailWorker = (event, context, callback) => {
  Queue.nextMessage((err, data) => {
    if (err) {
      console.error(err)
      return callback(null, response(500, { error: 'Failed to read message' }))
    } else {
      if (data.Messages) {
        console.log(data.Messages)

        const fistMessage = data.Messages[0]
        const firstMessageContent = JSON.parse(
          JSON.parse(fistMessage.Body).Message
        )
        const { ticket, gig } = firstMessageContent

        const params = {
          to: ticket.email,
          subject: 'Congrats! You bought a new gig',
          text: `Hey how are you today ${ticket.name}?`
        }

        Mailer.sendEmail(params, (err, info) => {
          if (err) {
            console.error('Error sending email', err)
          } else {
            console.log('Mail sent successfully!')
          }
        })
      } else {
        console.log('No message available')
      }
    }
  })
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
