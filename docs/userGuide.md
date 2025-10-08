# User Guide

**Please ensure the application is deployed, instructions in the deployment guide here:**

- [Deployment Guide](./deploymentGuide.md)

Once you have deployed the solution, the following user guide will help you navigate the functions available.

| Index                               | Description                             |
| ----------------------------------- | --------------------------------------- |
| [Administrator View](#admin-view)   | How the Administrator views the project |
| [Instructor View](#instructor-view) | How the Instructor views the project    |
| [Student View](#student-view)       | How the Student views the project       |

## Administrator View

To sign up as an administrator, you need to sign up regularly first as a student:
![image](./images/create-account.png)

You then get a confirmation email to verify your email. Once you have a student account, to become an administrator, you need to change your user group with Cognito through the AWS Console:
![image](./images/user-pool.png)

After clicking the user pool of the project, you need to find your email:
![image](./images/users.png)

After clicking your email, you can add the 'admin' user group:
![image](./images/add-user-group.png)
![image](./images/select-admin.png)
![image](./images/admin-added.png)

Once the 'admin' user group is added, delete the 'student' user group:
![image](./images/delete-student.png)
![image](./images/only-admin.png)

Upon logging in as an administrator, you will see the following home page:
![image](./images/admin-home-page.png)

Clicking the "ADD INSTRUCTOR" button opens a pop-up where the administrator can enter the email address of a user with an account to add them as an instructor:
![image](./images/admin-add-instructor.png)

The administrator can also click an instructor in the list, which takes them to a page consisting of that instructor's details, including their name, email, and active groups:
![image](./images/admin-instructor-details.png)

In the "Simulation Groups" tab, the administrator can view a list of the simulation groups available:
![image](./images/admin-groups.png)

Clicking on a simulation group leads to a page where the administrator can view all the instructors in that group while being able to change the status of the group:
![image](./images/admin-active.png)

Upon clicking the "Create Group" tab, the administrator can create a simulation group by specifying the name and description of the group. The administrator can also assign instructors to the group here while changing the "System Prompt" that the Large Language Model (LLM) uses as instructions when generating responses:
![image](./images/admin-create-group-button.png)
![image](./images/admin-create-group.png)

In the "AI Settings" tab, the administrator can set and alter the system prompt for the text and voice interaction, and the empathy coach.

Here is an example of the system prompt for the text and voice-based interaction:
![image](./images/ai_setting_sys_prompt_setting.png)
Here is an example the system prompt for the empathy coach:
Your prompt must include `{patient_context}` and `{user_text}` placeholders, and instruct the AI to return JSON with fields: empathy_score, perspective_taking, emotional_resonance, acknowledgment, language_communication, cognitive_empathy, affective_empathy, realism_flag, judge_reasoning, and feedback. These evaluation metrics were provided by the UBC Faculty of Pharmaceutical Sciences sponsors.
![image](./images/ai_setting_empathy_coach_prompt_setting.png)


## Instructor View

Upon logging in as an instructor, you will see the following home page:
![image](./images/instructor-home-page.png)

The instructor can click on the "Student View" to see the project as a student would. For more information on how a student views the project, click [here](#student-view). After clicking on a simulation group, the instructor can see the analytics of that group with several insights:
![image](./images/instructor-analytics.png)

Additionally, the instructor can access detailed graphs that illustrate student interactions with patients and their performance levels.
![image](./images/instructor-analytics1.png)

Clicking the "Edit Patients" tab leads to a page where the instructor can see a list of patients within the group. Here a new patient can be created or existing patients can be edited or deleted:
![image](./images/instructor-edit-concept.png)

The instructor can set for each patient whether or not they want the LLM to evaluate the student.
![image](./images/instructor-edit-LLM-completion.png)

By clicking the "CREATE NEW PATIENT" button, a pop-up will open where the instructor can create a new patient.
![image](./images/instructor-create-concept-button.png)

The patient's name, age, and gender can be specified here along with a patient prompt to influence how they will act.
![image](./images/instructor-create-concept1.png)

The instructor can then upload LLM, Patient, and Answer Key files to this patient from their device. `PDF`, `DOCX`, `PPTX`, `TXT`, `XLSX`, `XPS`, `MOBI`, and `CBZ` file types are supported. The "SAVE PATIENT" button here saves the patient:
![image](./images/instructor-create-concept2.png)
![image](./images/instructor-create-concept3.png)

By clicking the "EDIT" button, a pop-up will open where the instructor can edit the patient.
![image](./images/instructor-change-concept-button.png)

The patient's name, age, and gender can be edited here along with its patient prompt to influence how they will act. The instructor can also edit the LLM, Patient, and Answer Key files for the patient.
![image](./images/instructor-change-concept.png)
![image](./images/instructor-change-patient1.png)
![image](./images/instructor-change-patient2.png)
![image](./images/instructor-change-patient3.png)

Clicking the "Prompt Settings" tab leads to a page where the instructor can change the prompt applied to the LLM for this specific simulation group. Upon applying a new prompt, the instructor can also scroll to previous prompts the group used:
![image](./images/instructor-prompt-settings.png)
![image](./images/instructor-prompt-settings1.png)

Clicking the "View Students" tab leads to a page where the instructor can view all the students in this simulation group. The "Access Code" of the group is a special code that allows students to join the group. The instructor will have to send this code to them. The instructor can also generate a new group code on this page:
![image](./images/instructor-view-students.png)

The instructor can then click on a student, which takes them to that student's chat logs for every simulation gorup in the simulation group. Each tab represents a different group. Different conversations with the LLM are rendered as different dropdowns:
![image](./images/instructor-view-student-logs.png)

By clicking the session dropdown, we can view the chat history between that student and the LLM.
![image](./images/instructor-view-student-chat-history.png)

The instructor can also set the completion status for a student on this page by toggling the switch for the patients.
![image](./images/instructor-view-student-completion.png)

## Student View

Upon logging in as a student, they will see the following home page:
![image](./images/student-home-page.png)

We are going to be looking at the Chronic Pain group as an example. Upon selecting Chronic Pain, the student is shown a list of patients, including Pamela and Timothy:
![image](./images/student-patients.png)

If we click the "Review" button beside a patient (in this case, we will do Pamela), we are taken to a page where an LLM asks us a question and creates a new conversation:
![image](./images/student-new-conversation.png)

The student can then answer the questions the LLM asks in a conversational manner. The student can then respond to the questions the LLM asks to try and eventually find a cure or diagnose the patient. Once the student provides a cure or diagnosis, the LLM will either evaluate them (if the instructor has LLM evaluation on).
![image](./images/student-new-conversation-LLM-evaluation.png)

Or the LLM will stop answering the student (if the instructor has LLM evaluation off).
![image](./images/student-new-conversation-LLM-no-evaluation.png)

Additionally, on the chat page, the student can use the 'Notes' button to open a noteboard for anything they want to jot down while chatting with the patient.
![image](./images/student-new-conversation-notes-button.png)
![image](./images/student-new-conversation-notes.png)

Students are also able to start a voice conversation with their patient by pressing the mic icon in the chat bar at the bottom of the page.

![image](./images/student-spoken-convo-button.png)

From here, the patient will be able to converse with their patient in realtime, and access their notes.

![image](./images/student-spoken-convo.png)

At any point in the conversation, the student is able to view their empathy evaluation by clicking the empathy coach on the left-hand side. This will evaluate the student based on how much empathy they've shown towards their patient, and guide them as to how to be more empathetic.
![image](./images/empathy-coach-1.png)
![image](./images/empathy-coach-2.png)

The student can also access the patient info posted by the instructor. There, they can find useful information that may assist them in chatting with the patient.
![image](./images/student-new-conversation-patient-info-button.png)
![image](./images/student-new-conversation-patient-info.png)

The way students interact with patient information varies depending on the file type. For instance, as shown below, with an image, students can zoom in and flip it to examine details more closely. In contrast, with a PDF, they can scroll through pages or print the document for further review.
![image](./images/student-new-conversation-patient-info-img.png)

If a student is completely stuck, they can access the instructor-provided answer key by simply clicking the "Reveal Answer" button and confirming their choice.
![image](./images/student-new-conversation-key.png)
![image](./images/student-new-conversation-key1.png)

Upon going back to the list of patients, the student can see their learning journey as the patients they achieved competency for are marked complete:
![image](./images/student-complete-patient.png)
