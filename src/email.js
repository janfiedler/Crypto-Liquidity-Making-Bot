let config = require('../config');
const nodemailer = require('nodemailer');

let sendEmail = function(subject, text){
    return new Promise(resolve => {
        let mailOptions = config.mail.options;
        mailOptions.subject = subject;
        mailOptions.text = text;

        let transporter = nodemailer.createTransport(config.mail.setting);

        transporter.verify(function(error, success) {
            if (error) {
                console.log(error);
            } else {
                transporter.sendMail(mailOptions, function(error, info){
                    if (error) {
                        console.log(error);
                    } else {
                        console.log('Email sent: ' + info.response);
                    }
                });
            }
        });
    });
};

module.exports = {
    sendEmail: sendEmail
};