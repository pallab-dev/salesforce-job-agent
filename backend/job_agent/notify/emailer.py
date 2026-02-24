from __future__ import annotations

import smtplib
from email.message import EmailMessage


def send_email(
    *,
    smtp_host: str,
    smtp_port: int,
    email_user: str,
    email_pass: str,
    email_to: str | None,
    subject: str,
    body: str,
) -> None:
    recipient = (email_to or "").strip() or email_user

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = email_user
    message["To"] = recipient
    message.set_content(body, charset="utf-8")

    server = smtplib.SMTP(smtp_host, smtp_port)
    try:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(email_user, email_pass)
        server.send_message(message)
    finally:
        server.quit()
