package com.example.demo;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class UserRepository {

    @PersistenceContext
    private EntityManager entityManager;

    public List searchByName(String name) {
        return entityManager.createNativeQuery("SELECT * FROM users WHERE name = '" + name + "'").getResultList();
    }
}

