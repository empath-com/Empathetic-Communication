FROM public.ecr.aws/lambda/python:3.12

# Install system dependencies
RUN dnf -y install postgresql-devel gcc gcc-c++ libpq make

# Install Poetry
RUN pip install poetry

# Copy Poetry files
COPY text_generation/pyproject.toml text_generation/poetry.lock* ${LAMBDA_TASK_ROOT}/

# Configure Poetry and install dependencies directly
WORKDIR ${LAMBDA_TASK_ROOT}
RUN poetry config virtualenvs.create false && \
    poetry install --no-root

# Copy the source code
COPY text_generation/src/ ${LAMBDA_TASK_ROOT}/
COPY shared/ ${LAMBDA_TASK_ROOT}/shared/

# Set the CMD to your handler (handler function in main.py)
# Updated: 2026-01-02 - Force rebuild
CMD ["main.handler"]