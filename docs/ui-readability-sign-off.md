# R-UI-5 readability sign-off

**Manual, filled in by the user.** The agent leaves every field blank. Submission waits for a recorded pass.

Requirement: R-UI-5 (docs/requirements.md) and Requirement 10.9 of the cemetery-ui spec. A person outside the project views the Demo scan with no explanation and answers the two questions below.

## Setup

- Viewport: 1440 by 900
- Legend: closed
- Drawer: closed
- Explanation given to the reviewer: none
- Scan shown: the Demo scan

## Record

| Field | Value |
| --- | --- |
| Reviewer name | |
| Date | |
| Commit SHA | |
| Question 1: "Which grave would you fix first?" Reviewer's answer | |
| Question 2: "What does a ghost mean?" Reviewer's answer | |
| Result (pass or fail) | |

## Pass condition

Pass when the reviewer names the first grave in triage order (the Possessed grave, `left-padder` in the Demo scan) and says that a ghost means one or more advisories. Anything else is a fail: change the encoding, not the question.
