from django.db import models

class UserProfile(models.Model):
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)

    def get_by_username(cls, username):
        return cls.objects.filter(username=username).first()

